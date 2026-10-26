import mongoose from 'mongoose';
import { Bed } from '../models/Bed.js';
import { Stay } from '../models/Stay.js';
import { ApiError } from '../utils/ApiError.js';
import { pageMeta, paginate } from '../utils/pagination.js';
import { countLiveBeds, getRoom } from './room.service.js';

const NUMERIC = { locale: 'en', numericOrdering: true };

// A..Z, AA..ZZ, ... (bijective base-26)
const indexToLabel = (index) => {
  let n = index + 1;
  let label = '';
  while (n > 0) {
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
};

const nextLabels = (taken, count) => {
  const labels = [];
  for (let i = 0; labels.length < count; i += 1) {
    const label = indexToLabel(i);
    if (!taken.has(label)) labels.push(label);
  }
  return labels;
};

const assertRoomAcceptsBeds = async (room, adding) => {
  if (room.status === 'inactive') throw ApiError.conflict('Room is inactive');
  const live = await countLiveBeds(room._id);
  if (live + adding > room.capacity) {
    throw ApiError.badRequest(
      `Room ${room.number} has capacity ${room.capacity} and already has ${live} bed(s); cannot add ${adding}`,
    );
  }
};

// The pre-check above can race with a concurrent create, so re-count after inserting and back out
// if capacity was exceeded. Concurrent racers may both back out; none can exceed capacity.
const enforceCapacityAfterInsert = async (room, ids) => {
  if ((await countLiveBeds(room._id)) > room.capacity) {
    await Bed.deleteMany({ _id: { $in: ids } });
    throw ApiError.badRequest(`Room ${room.number} capacity (${room.capacity}) exceeded`);
  }
};

const duplicateLabel = (room, label) =>
  ApiError.conflict(
    `Bed ${label} already exists in room ${room.number} (an inactive bed keeps its label; reactivate it instead)`,
  );

export const createBed = async (propertyId, roomId, input) => {
  const room = await getRoom(propertyId, roomId);
  await assertRoomAcceptsBeds(room, 1);

  let bed;
  try {
    bed = await Bed.create({ ...input, property: propertyId, room: room._id });
  } catch (err) {
    if (err?.code === 11000) throw duplicateLabel(room, input.label);
    throw err;
  }
  await enforceCapacityAfterInsert(room, [bed._id]);
  return bed.toObject();
};

export const createBedsBulk = async (propertyId, roomId, { count, labels, monthlyRent }) => {
  const room = await getRoom(propertyId, roomId);
  await assertRoomAcceptsBeds(room, count);

  const existing = new Set(await Bed.find({ room: room._id }).distinct('label'));
  const clashes = labels?.filter((label) => existing.has(label));
  if (clashes?.length) throw duplicateLabel(room, clashes.join(', '));

  const docs = (labels ?? nextLabels(existing, count)).map((label) => ({
    _id: new mongoose.Types.ObjectId(),
    property: propertyId,
    room: room._id,
    label,
    ...(monthlyRent !== undefined && { monthlyRent }),
  }));
  const ids = docs.map((d) => d._id);

  // No transactions on standalone Mongo: on any failure, remove what this call inserted.
  try {
    await Bed.insertMany(docs);
    await enforceCapacityAfterInsert(room, ids);
  } catch (err) {
    await Bed.deleteMany({ _id: { $in: ids } });
    if (err?.code === 11000) throw ApiError.conflict(`A bed label already exists in room ${room.number}`);
    throw err;
  }
  return Bed.find({ _id: { $in: ids } }).collation(NUMERIC).sort({ label: 1 }).lean();
};

export const listBeds = async (propertyId, { roomId, status, ...paging }) => {
  const filter = { property: propertyId };
  if (roomId) filter.room = roomId;
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    Bed.find(filter)
      .collation(NUMERIC)
      .sort({ room: 1, label: 1 })
      .skip(paginate(paging).skip)
      .limit(paging.limit)
      .lean(),
    Bed.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(paging, total) };
};

export const listRoomBeds = async (propertyId, roomId, query) => {
  await getRoom(propertyId, roomId);
  return listBeds(propertyId, { ...query, roomId });
};

const getBed = async (propertyId, roomId, bedId) => {
  const bed = await Bed.findOne({ _id: bedId, room: roomId, property: propertyId }).lean();
  if (!bed) throw ApiError.notFound('Bed not found');
  return bed;
};

export const updateBed = async (propertyId, roomId, bedId, patch) => {
  const bed = await getBed(propertyId, roomId, bedId);
  const { status, monthlyRent, ...rest } = patch;

  if (status !== undefined && status !== bed.status) {
    if (await Stay.exists({ bed: bed._id, status: 'active' })) {
      throw ApiError.conflict('Bed has an active stay; transfer the resident first');
    }
    if (bed.status === 'occupied') {
      throw ApiError.conflict('Occupied beds are released through the stay check-out flow (Phase 3)');
    }
    if (status === 'inactive' && bed.status === 'reserved') {
      throw ApiError.conflict('Reserved beds must be released before they can be deactivated');
    }
    if (bed.status === 'inactive') await assertRoomAcceptsBeds(await getRoom(propertyId, roomId), 1);
  }

  const update = { $set: { ...rest, ...(status !== undefined && { status }) } };
  if (monthlyRent === null) update.$unset = { monthlyRent: 1 };
  else if (monthlyRent !== undefined) update.$set.monthlyRent = monthlyRent;

  try {
    return await Bed.findOneAndUpdate({ _id: bedId, room: roomId, property: propertyId }, update, {
      new: true,
      runValidators: true,
    }).lean();
  } catch (err) {
    if (err?.code === 11000) throw duplicateLabel(await getRoom(propertyId, roomId), patch.label);
    throw err;
  }
};

// DELETE is a soft delete (status -> inactive); the bed keeps its label and history.
export const deactivateBed = async (propertyId, roomId, bedId) => {
  const bed = await getBed(propertyId, roomId, bedId);
  if (bed.status === 'occupied' || bed.status === 'reserved' || (await Stay.exists({ bed: bed._id, status: 'active' }))) {
    throw ApiError.conflict('Bed is in use and cannot be deactivated');
  }
  return Bed.findByIdAndUpdate(bedId, { status: 'inactive' }, { new: true }).lean();
};
