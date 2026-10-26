import { Room } from '../models/Room.js';
import { Bed } from '../models/Bed.js';
import { Stay } from '../models/Stay.js';
import { ApiError } from '../utils/ApiError.js';
import { pageMeta, paginate } from '../utils/pagination.js';

const NUMERIC = { locale: 'en', numericOrdering: true };

export const countLiveBeds = (roomId) => Bed.countDocuments({ room: roomId, status: { $ne: 'inactive' } });

const rethrowDuplicate = (err, number) => {
  if (err?.code === 11000) throw ApiError.conflict(`Room ${number} already exists in this property`);
  throw err;
};

// Every room lookup is scoped by property so a room id from another tenant never resolves.
export const getRoom = async (propertyId, roomId) => {
  const room = await Room.findOne({ _id: roomId, property: propertyId }).lean();
  if (!room) throw ApiError.notFound('Room not found');
  return room;
};

export const createRoom = async (propertyId, input) => {
  try {
    return (await Room.create({ ...input, property: propertyId })).toObject();
  } catch (err) {
    return rethrowDuplicate(err, input.number);
  }
};

export const listRooms = async (propertyId, { status, floor, ...paging }) => {
  const filter = { property: propertyId };
  if (status) filter.status = status;
  if (floor !== undefined) filter.floor = floor;

  const [items, total] = await Promise.all([
    Room.find(filter)
      .collation(NUMERIC)
      .sort({ floor: 1, number: 1 })
      .skip(paginate(paging).skip)
      .limit(paging.limit)
      .lean(),
    Room.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(paging, total) };
};

const deactivate = async (room) => {
  const blocking = await Bed.exists({ room: room._id, status: { $in: ['occupied', 'reserved'] } });
  if (blocking || (await Stay.exists({ room: room._id, status: 'active' }))) throw ApiError.conflict('Room has occupied or reserved beds and cannot be deactivated');
  await Bed.updateMany({ room: room._id, status: { $ne: 'inactive' } }, { status: 'inactive' });
};

export const updateRoom = async (propertyId, roomId, patch) => {
  const room = await getRoom(propertyId, roomId);

  if (patch.capacity !== undefined && patch.capacity < (await countLiveBeds(room._id))) {
    throw ApiError.badRequest('Capacity cannot be less than the current number of beds');
  }
  if (patch.status === 'inactive' && room.status !== 'inactive') await deactivate(room);

  try {
    return await Room.findOneAndUpdate(
      { _id: roomId, property: propertyId },
      { $set: patch },
      { new: true, runValidators: true },
    ).lean();
  } catch (err) {
    return rethrowDuplicate(err, patch.number);
  }
};

// DELETE is a soft delete: the room and its beds become inactive.
export const deactivateRoom = async (propertyId, roomId) => {
  const room = await getRoom(propertyId, roomId);
  if (room.status !== 'inactive') {
    await deactivate(room);
    return Room.findByIdAndUpdate(roomId, { status: 'inactive' }, { new: true }).lean();
  }
  return room;
};
