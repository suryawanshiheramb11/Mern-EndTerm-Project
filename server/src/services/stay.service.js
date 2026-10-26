import mongoose from 'mongoose';
import { Bed } from '../models/Bed.js';
import { Property } from '../models/Property.js';
import { Resident } from '../models/Resident.js';
import { Room } from '../models/Room.js';
import { Stay } from '../models/Stay.js';
import { PERMISSIONS } from '../config/permissions.js';
import { runAtomic } from '../config/transactions.js';
import { ApiError } from '../utils/ApiError.js';
import { addDays, businessToday } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { pageMeta, paginate } from '../utils/pagination.js';
import { assertPropertyAccess, getUserPropertyIds } from './propertyAccess.service.js';
import { loadInScope } from './scope.js';
import { assertInvitable, inviteResident } from './resident.service.js';

const WRITE = PERMISSIONS.STAYS_WRITE;

const fieldError = (field, message) => ApiError.badRequest('Validation failed', [{ field, message }]);

const effectiveRent = (bed, room) => bed.monthlyRent ?? room.defaultMonthlyRent;

const populateStay = (query) =>
  query.populate('resident', 'fullName phone').populate('room', 'number floor').populate('bed', 'label status');

/*
 * Why the unique indexes alone are not enough
 *
 * The partial unique indexes on Stay (one active stay per bed / per resident) stop two *stays*
 * from coexisting, but a bed's status lives in a separate document (Bed.status) that the
 * indexes know nothing about. Check-in is therefore two writes - flip the bed, insert the stay -
 * and a read-then-write check ("is the bed available?") lets two requests both pass before
 * either writes, leaving Bed.status and the stays out of step (e.g. a 'reserved' bed, or a bed
 * released by one request while another still holds it).
 *
 * So the bed is claimed first with a conditional atomic update (status must still be
 * 'available'); only the winner proceeds to insert the stay. The indexes remain the backstop:
 * if a duplicate-key error (11000) still happens, the bed claim is undone and the caller gets a 409.
 * With a replica set both writes share one transaction (config/transactions.js); on standalone
 * MongoDB the registered rollbacks undo completed steps instead.
 */

/**
 * Atomically moves a bed from 'available' to `target`. Only one concurrent caller can win;
 * the rest see null and get a 409. Registers the undo for non-transactional deployments.
 */
const claimBed = async (bed, target, { session, onRollback }) => {
  const claimed = await Bed.findOneAndUpdate(
    { _id: bed._id, property: bed.property, status: 'available' },
    { $set: { status: target } },
    { new: true, session },
  );
  if (!claimed) throw ApiError.conflict('Bed is no longer available');
  onRollback(() => Bed.updateOne({ _id: bed._id, status: target }, { $set: { status: 'available' } }));
  return claimed;
};

// The partial unique indexes are the last line of defence against double allocation.
const insertStay = async (doc, { session }) => {
  try {
    const [stay] = await Stay.create([doc], { session });
    return stay;
  } catch (err) {
    if (err?.code !== 11000) throw err;
    throw ApiError.conflict(
      err.keyPattern?.resident ? 'Resident already has an active stay; transfer them instead' : 'Bed is already assigned',
    );
  }
};

const loadBedForStay = async (user, bedId, residentPropertyId) => {
  const bed = await loadInScope(Bed, bedId, user, { label: 'Bed', permission: WRITE });
  if (!bed.property.equals(residentPropertyId)) {
    throw ApiError.badRequest('Resident and bed belong to different properties');
  }
  const room = await Room.findById(bed.room).lean();
  if (!room || room.status !== 'active') throw ApiError.conflict('Room is not active');
  if (bed.status !== 'available') throw ApiError.conflict(`Bed is ${bed.status} and cannot be assigned`);
  return { bed, room };
};

export const createStay = async (user, input) => {
  const resident = await loadInScope(Resident, input.residentId, user, { label: 'Resident', permission: WRITE });
  const { bed, room } = await loadBedForStay(user, input.bedId, resident.property);

  if (resident.status !== 'active') throw ApiError.conflict('Resident is not active');
  if (await Stay.exists({ resident: resident._id, status: 'active' })) {
    throw ApiError.conflict('Resident already has an active stay; transfer them instead');
  }

  const today = businessToday();
  const reserving = input.action === 'reserve';
  if (reserving && input.checkInDate <= today) throw fieldError('checkInDate', 'A reservation needs a future check-in date');
  if (!reserving && (input.checkInDate > today || input.checkInDate < addDays(today, -1))) {
    throw fieldError('checkInDate', 'Check-in date must be today or yesterday');
  }

  const monthlyRentPaise = input.monthlyRentPaise ?? effectiveRent(bed, room);
  if (monthlyRentPaise === undefined) {
    throw fieldError('monthlyRentPaise', 'Required: neither the bed nor the room has a rent set');
  }
  if ((input.agreedDiscountPaise ?? 0) > monthlyRentPaise) {
    throw fieldError('agreedDiscountPaise', 'Discount cannot exceed the monthly rent');
  }
  if (input.inviteStudent) await assertInvitable(resident);

  const property = await Property.findById(resident.property).lean();
  const doc = {
    property: resident.property,
    resident: resident._id,
    room: room._id,
    bed: bed._id,
    checkInDate: input.checkInDate,
    expectedCheckOutDate: input.expectedCheckOutDate,
    monthlyRentPaise,
    depositPaise: input.depositPaise,
    billingDay: input.billingDay ?? property.settings.billingDay,
    agreedDiscountPaise: input.agreedDiscountPaise ?? 0,
    termsAcknowledgedAt: new Date(),
    createdBy: user._id,
    ...(reserving && { reservationTimer: input.checkInDate }),
  };

  const stay = await runAtomic(async (ctx) => {
    await claimBed(bed, reserving ? 'reserved' : 'occupied', ctx);
    return insertStay(doc, ctx);
  });

  const result = { stay: stay.toObject(), bed: await Bed.findById(bed._id).lean() };
  if (input.inviteStudent) {
    try {
      result.invite = await inviteResident(resident);
    } catch (err) {
      // The stay is already committed; report the failed invite instead of failing the request.
      logger.warn(`Invite after check-in failed: ${err.message}`);
      result.inviteError = err.message;
    }
  }
  return result;
};

export const transferStay = async (user, stayId, input) => {
  const stay = await loadInScope(Stay, stayId, user, { label: 'Stay', permission: WRITE });
  if (stay.status !== 'active') throw ApiError.conflict('Stay has already ended');
  if (stay.reservationTimer) throw ApiError.conflict('Reservations cannot be transferred yet');
  if (stay.bed.equals(input.newBedId)) throw ApiError.badRequest('Resident is already in this bed');

  const { bed: newBed, room: newRoom } = await loadBedForStay(user, input.newBedId, stay.property);

  if (input.transferDate < stay.checkInDate) throw fieldError('transferDate', 'Cannot be before the check-in date');
  if (input.transferDate > businessToday()) throw fieldError('transferDate', 'Cannot be in the future');

  const monthlyRentPaise = input.monthlyRentPaise ?? effectiveRent(newBed, newRoom) ?? stay.monthlyRentPaise;
  if (stay.agreedDiscountPaise > monthlyRentPaise) {
    throw fieldError('monthlyRentPaise', 'Rent cannot be lower than the agreed discount');
  }

  const newStayId = new mongoose.Types.ObjectId();

  const created = await runAtomic(async (ctx) => {
    const { session, onRollback } = ctx;

    await claimBed(newBed, 'occupied', ctx);

    // End the old stay first: the one-active-stay-per-resident index forbids overlap.
    const ended = await Stay.findOneAndUpdate(
      { _id: stay._id, status: 'active' },
      {
        $set: {
          status: 'ended',
          endedReason: 'transfer',
          actualCheckOutDate: input.transferDate,
          transferredToStay: newStayId,
          ...(input.reason && { endedNote: input.reason }),
        },
      },
      { new: true, session },
    );
    if (!ended) throw ApiError.conflict('Stay has already ended');
    onRollback(() =>
      Stay.updateOne(
        { _id: stay._id },
        { $set: { status: 'active' }, $unset: { endedReason: 1, actualCheckOutDate: 1, transferredToStay: 1, endedNote: 1 } },
      ),
    );

    const next = await insertStay(
      {
        _id: newStayId,
        property: stay.property,
        resident: stay.resident,
        room: newRoom._id,
        bed: newBed._id,
        checkInDate: input.transferDate,
        expectedCheckOutDate: stay.expectedCheckOutDate,
        monthlyRentPaise,
        depositPaise: stay.depositPaise, // the deposit follows the resident to the latest stay
        billingDay: stay.billingDay,
        agreedDiscountPaise: stay.agreedDiscountPaise,
        termsAcknowledgedAt: stay.termsAcknowledgedAt,
        createdBy: user._id,
        transferredFromStay: stay._id,
      },
      ctx,
    );
    onRollback(() => Stay.deleteOne({ _id: newStayId }));

    const released = await Bed.findOneAndUpdate(
      { _id: stay.bed, status: 'occupied' },
      { $set: { status: 'available' } },
      { new: true, session },
    );
    if (!released) throw ApiError.conflict('Previous bed is not in an occupied state; transfer aborted');

    return next;
  });

  const [previous, oldBed, newBedDoc] = await Promise.all([
    Stay.findById(stay._id).lean(),
    Bed.findById(stay.bed).lean(),
    Bed.findById(newBed._id).lean(),
  ]);
  return { stay: created.toObject(), previousStay: previous, bed: newBedDoc, releasedBed: oldBed };
};

export const listStays = async (user, { propertyId, status, residentId, bedId, ...paging }) => {
  const permission = PERMISSIONS.RESIDENTS_VIEW;
  let propertyScope;
  if (propertyId) {
    await assertPropertyAccess(user, propertyId, { permission });
    propertyScope = propertyId;
  } else {
    propertyScope = { $in: await getUserPropertyIds(user, { permission }) };
  }

  const filter = { property: propertyScope };
  if (status) filter.status = status;
  if (residentId) filter.resident = residentId;
  if (bedId) filter.bed = bedId;

  const [items, total] = await Promise.all([
    populateStay(Stay.find(filter).sort({ checkInDate: -1, createdAt: -1 }).skip(paginate(paging).skip).limit(paging.limit)).lean(),
    Stay.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(paging, total) };
};

export const getStay = async (user, id) => {
  const stay = await loadInScope(Stay, id, user, { label: 'Stay', permission: PERMISSIONS.RESIDENTS_VIEW });
  return populateStay(Stay.findById(stay._id)).lean();
};
