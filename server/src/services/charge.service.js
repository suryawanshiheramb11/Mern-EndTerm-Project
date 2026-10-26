import { RentCharge } from '../models/RentCharge.js';
import { PERMISSIONS } from '../config/permissions.js';
import { Property } from '../models/Property.js';
import { Stay } from '../models/Stay.js';
import { ApiError } from '../utils/ApiError.js';
import { businessToday } from '../utils/dates.js';
import {
  deriveStatus,
  dueDateFor,
  nextPeriodKey,
  outstandingOf,
  periodBounds,
  periodKeyOf,
} from '../utils/billing.js';
import { pageMeta, paginate } from '../utils/pagination.js';
import { assertPropertyAccess } from './propertyAccess.service.js';
import { loadInScope, scopeFilter } from './scope.js';
import { writeAudit } from './audit.service.js';

const fieldError = (field, message) => ApiError.badRequest('Validation failed', [{ field, message }]);

export const graceDaysFor = (property) => property?.settings?.gracePeriodDays ?? 0;

/** Re-derives and persists the status of one charge from its current numbers. */
export const refreshChargeStatus = async (chargeId, { today = businessToday(), graceDays } = {}) => {
  const charge = await RentCharge.findById(chargeId).lean();
  if (!charge) return null;
  const grace = graceDays ?? graceDaysFor(await Property.findById(charge.property, { settings: 1 }).lean());
  const status = deriveStatus(charge, { today, graceDays: grace });
  if (status === charge.status) return charge;
  return RentCharge.findByIdAndUpdate(chargeId, { $set: { status } }, { new: true }).lean();
};

const assertPeriodAllowed = (periodKey, today) => {
  // Billing more than one month ahead is almost certainly a typo.
  if (periodKey > nextPeriodKey(periodKeyOf(today))) {
    throw fieldError('periodKey', 'Cannot generate charges more than one month ahead');
  }
};

/**
 * Creates the rent charge for one stay and period, or skips it. Idempotent: the unique
 * { stay, periodKey } index plus an upsert mean running it twice never creates a second charge.
 * Returns { created, skipped, reason?, charge }; with dryRun nothing is written and `charge` is
 * the charge that would be created.
 */
export const generateForStay = async ({ stayId, periodKey, dryRun = false, today = businessToday(), property }) => {
  const stay = await Stay.findById(stayId).lean();
  if (!stay) throw ApiError.notFound('Stay not found');
  if (stay.status !== 'active') throw ApiError.conflict('Stay is not active; rent is only charged for active stays');
  assertPeriodAllowed(periodKey, today);

  const { periodStart, periodEnd } = periodBounds(periodKey);
  const skip = (reason) => ({ created: 0, skipped: 1, reason, charge: null });

  if (stay.reservationTimer) return skip('reservation');
  if (stay.checkInDate > periodEnd) return skip('before_check_in');
  if (await RentCharge.exists({ stay: stay._id, periodKey })) return skip('already_exists');
  // A transfer opens a new stay; the resident must not be billed twice for the same month.
  if (await RentCharge.exists({ resident: stay.resident, periodKey })) return skip('resident_already_billed');

  const prop = property ?? (await Property.findById(stay.property, { settings: 1 }).lean());
  const amountPaise = stay.monthlyRentPaise - (stay.agreedDiscountPaise ?? 0); // never the deposit
  const draft = {
    property: stay.property,
    resident: stay.resident,
    stay: stay._id,
    periodKey,
    periodStart,
    periodEnd,
    amountPaise,
    discountPaise: 0,
    adjustments: [],
    netDuePaise: amountPaise,
    paidPaise: 0,
    dueDate: dueDateFor(periodKey, stay.billingDay),
    notes: undefined,
  };
  draft.status = deriveStatus(draft, { today, graceDays: graceDaysFor(prop) });

  if (dryRun) return { created: 1, skipped: 0, charge: draft };

  await new RentCharge(draft).validate();
  try {
    const result = await RentCharge.updateOne({ stay: stay._id, periodKey }, { $setOnInsert: draft }, { upsert: true });
    if (!result.upsertedCount) return skip('already_exists');
  } catch (err) {
    if (err?.code === 11000) return skip('already_exists'); // lost a race with a concurrent run
    throw err;
  }
  return { created: 1, skipped: 0, charge: await RentCharge.findOne({ stay: stay._id, periodKey }).lean() };
};

export const generateForProperty = async ({ propertyId, periodKey, dryRun = false, today = businessToday() }) => {
  assertPeriodAllowed(periodKey, today);
  const property = await Property.findById(propertyId, { settings: 1 }).lean();
  if (!property) throw ApiError.notFound('Property not found');

  const stays = await Stay.find({ property: propertyId, status: 'active' })
    .populate('resident', 'fullName')
    .sort({ createdAt: 1 })
    .lean();

  const summary = { created: 0, skipped: 0, items: [] };
  for (const stay of stays) {
    const result = await generateForStay({ stayId: stay._id, periodKey, dryRun, today, property });
    summary.created += result.created;
    summary.skipped += result.skipped;
    summary.items.push({
      stayId: String(stay._id),
      residentId: String(stay.resident._id),
      residentName: stay.resident.fullName,
      action: result.created ? 'create' : 'skip',
      reason: result.reason,
      amountPaise: result.charge?.amountPaise ?? stay.monthlyRentPaise - (stay.agreedDiscountPaise ?? 0),
      dueDate: result.charge?.dueDate ?? dueDateFor(periodKey, stay.billingDay),
    });
  }
  return summary;
};

/* ----- user-facing operations (authorization lives here, like the other services) ----- */

export const generate = async (user, { propertyId, stayId, periodKey, dryRun }) => {
  if (stayId) {
    const stay = await loadInScope(Stay, stayId, user, { label: 'Stay' });
    const result = await generateForStay({ stayId: stay._id, periodKey, dryRun });
    return { dryRun: Boolean(dryRun), created: result.created, skipped: result.skipped, items: [{ stayId, action: result.created ? 'create' : 'skip', reason: result.reason }] };
  }
  await assertPropertyAccess(user, propertyId);
  const summary = await generateForProperty({ propertyId, periodKey, dryRun });
  if (!dryRun) {
    await writeAudit({ user, action: 'charges.generate', entityType: 'Property', entityId: propertyId, property: propertyId, meta: { periodKey, created: summary.created, skipped: summary.skipped } });
  }
  return { dryRun: Boolean(dryRun), ...summary };
};

const populateCharge = (query) => query.populate('resident', 'fullName phone').populate('stay', 'bed room status');

export const listCharges = async (user, { propertyId, status, periodKey, residentId, ...paging }) => {
  const filter = await scopeFilter(user, propertyId, residentId, { permission: PERMISSIONS.PAYMENTS_VIEW });
  if (status) filter.status = status;
  if (periodKey) filter.periodKey = periodKey;

  const [items, total] = await Promise.all([
    populateCharge(
      RentCharge.find(filter).sort({ dueDate: -1, createdAt: -1 }).skip(paginate(paging).skip).limit(paging.limit),
    ).lean(),
    RentCharge.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(paging, total) };
};

export const getCharge = async (user, id) => {
  const charge = await loadInScope(RentCharge, id, user, { label: 'Rent charge', permission: PERMISSIONS.PAYMENTS_VIEW });
  return populateCharge(RentCharge.findById(charge._id)).lean();
};

const assertEditable = (charge) => {
  if (charge.status === 'waived') throw ApiError.conflict('Charge has been waived and can no longer be changed');
};

const staleError = () => ApiError.conflict('Charge changed while updating; please reload and retry');

/**
 * Adjusts the net due by a signed amount, atomically refusing to push it below what has already
 * been paid (that would silently create an overpayment). `extraSet` rides in the same update.
 */
const applyDelta = async (charge, deltaPaise, { push, set = {}, guard = {} }) => {
  const updated = await RentCharge.findOneAndUpdate(
    {
      _id: charge._id,
      status: { $ne: 'waived' },
      ...guard,
      $expr: { $gte: [{ $add: ['$netDuePaise', deltaPaise] }, '$paidPaise'] },
    },
    {
      $inc: { netDuePaise: deltaPaise },
      ...(Object.keys(set).length && { $set: set }),
      ...(push && { $push: { adjustments: push } }),
    },
    { new: true },
  );
  if (!updated) {
    const fresh = await RentCharge.findById(charge._id).lean();
    if (fresh && fresh.status !== 'waived' && fresh.netDuePaise + deltaPaise < fresh.paidPaise) {
      throw ApiError.conflict('This would reduce the amount due below what has already been paid; reverse a payment first');
    }
    throw staleError();
  }
  return updated;
};

export const updateCharge = async (user, id, patch) => {
  const charge = await loadInScope(RentCharge, id, user, { label: 'Rent charge' });
  assertEditable(charge);
  const { discountPaise, dueDate, notes } = patch;

  if (discountPaise !== undefined) {
    if (discountPaise > charge.amountPaise) throw fieldError('discountPaise', 'Discount cannot exceed the charge amount');
    await applyDelta(charge, charge.discountPaise - discountPaise, {
      set: { discountPaise, ...(dueDate && { dueDate }), ...(notes !== undefined && { notes }) },
      guard: { discountPaise: charge.discountPaise },
    });
  } else {
    await RentCharge.updateOne(
      { _id: charge._id, status: { $ne: 'waived' } },
      { $set: { ...(dueDate && { dueDate }), ...(notes !== undefined && { notes }) } },
    );
  }
  await refreshChargeStatus(charge._id);
  await writeAudit({
    user, action: 'charge.update', entityType: 'RentCharge', entityId: charge._id, property: charge.property,
    before: { discountPaise: charge.discountPaise, dueDate: charge.dueDate, notes: charge.notes },
    after: { ...(discountPaise !== undefined && { discountPaise }), ...(dueDate && { dueDate }), ...(notes !== undefined && { notes }) },
  });
  return getCharge(user, id);
};

export const adjustCharge = async (user, id, { amountPaise, reason }) => {
  const charge = await loadInScope(RentCharge, id, user, { label: 'Rent charge' });
  assertEditable(charge);
  if (charge.netDuePaise + amountPaise < 0) throw fieldError('amountPaise', 'Net due cannot go below zero');

  await applyDelta(charge, amountPaise, {
    push: { amountPaise, reason, kind: 'adjustment', createdBy: user._id, createdAt: new Date() },
  });
  await refreshChargeStatus(charge._id);
  await writeAudit({
    user, action: 'charge.adjust', entityType: 'RentCharge', entityId: charge._id, property: charge.property,
    before: { netDuePaise: charge.netDuePaise }, after: { netDuePaise: charge.netDuePaise + amountPaise }, meta: { amountPaise, reason },
  });
  return getCharge(user, id);
};

/** Waives whatever is still owed: records a negative adjustment for it and marks the charge waived. */
export const waiveCharge = async (user, id, { reason }) => {
  const charge = await loadInScope(RentCharge, id, user, { label: 'Rent charge' });
  assertEditable(charge);
  const owed = outstandingOf(charge, charge.paidPaise);
  if (owed <= 0) throw ApiError.conflict('Nothing is outstanding on this charge');

  const waived = await RentCharge.findOneAndUpdate(
    // Guard: nothing was paid or adjusted since we read the charge.
    { _id: charge._id, status: { $ne: 'waived' }, netDuePaise: charge.netDuePaise, paidPaise: charge.paidPaise },
    {
      $inc: { netDuePaise: -owed },
      $set: { status: 'waived' },
      $push: { adjustments: { amountPaise: -owed, reason, kind: 'waiver', createdBy: user._id, createdAt: new Date() } },
    },
    { new: true },
  );
  if (!waived) throw staleError();
  await writeAudit({
    user, action: 'charge.waive', entityType: 'RentCharge', entityId: charge._id, property: charge.property,
    before: { status: charge.status, netDuePaise: charge.netDuePaise }, after: { status: 'waived', netDuePaise: waived.netDuePaise }, meta: { reason, waivedPaise: owed },
  });
  return getCharge(user, id);
};
