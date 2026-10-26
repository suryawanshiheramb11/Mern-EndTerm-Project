import mongoose from 'mongoose';
import { Property } from '../models/Property.js';
import { Room } from '../models/Room.js';
import { Bed, BED_STATUSES } from '../models/Bed.js';
import { Stay } from '../models/Stay.js';
import { ApiError } from '../utils/ApiError.js';
import { toRupees } from '../utils/money.js';
import { toDotPaths } from '../utils/objects.js';
import { pageMeta, paginate } from '../utils/pagination.js';
import { getUserPropertyIds } from './propertyAccess.service.js';

// Callers must have passed assertPropertyAccess for `propertyId` before reaching these.
const loadProperty = async (propertyId) => {
  const property = await Property.findOne({ _id: propertyId, isActive: true }).lean();
  if (!property) throw ApiError.notFound('Property not found');
  return property;
};

export const createProperty = async (user, input) => {
  const property = await Property.create({ ...input, owner: user._id });
  return property.toObject();
};

export const listProperties = async (user, query) => {
  const filter = { _id: { $in: await getUserPropertyIds(user) } };
  const [items, total] = await Promise.all([
    Property.find(filter).sort({ createdAt: -1 }).skip(paginate(query).skip).limit(query.limit).lean(),
    Property.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(query, total) };
};

export const getProperty = loadProperty;

export const updateProperty = async (propertyId, patch) => {
  const property = await Property.findOneAndUpdate(
    { _id: propertyId, isActive: true },
    { $set: toDotPaths(patch) },
    { new: true, runValidators: true },
  ).lean();
  if (!property) throw ApiError.notFound('Property not found');
  return property;
};

export const deactivateProperty = async (propertyId) => {
  if (await Stay.exists({ property: propertyId, status: 'active' })) {
    throw ApiError.conflict('Property has active stays and cannot be deactivated');
  }
  const property = await Property.findOneAndUpdate(
    { _id: propertyId, isActive: true },
    { isActive: false },
    { new: true },
  ).lean();
  if (!property) throw ApiError.notFound('Property not found');
  return property;
};

export const getOverview = async (propertyId) => {
  await loadProperty(propertyId);
  const property = new mongoose.Types.ObjectId(propertyId);

  const [totalRooms, statusCounts, rent, residentsCount] = await Promise.all([
    Room.countDocuments({ property, status: { $ne: 'inactive' } }),
    Bed.aggregate([{ $match: { property } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Bed.aggregate([
      { $match: { property, status: { $ne: 'inactive' } } },
      { $lookup: { from: Room.collection.name, localField: 'room', foreignField: '_id', as: 'roomDoc' } },
      { $unwind: '$roomDoc' },
      { $project: { rent: { $ifNull: ['$monthlyRent', '$roomDoc.defaultMonthlyRent'] } } },
      { $group: { _id: null, min: { $min: '$rent' }, max: { $max: '$rent' } } },
    ]),
    // Checked-in residents; reservations (reservationTimer set) don't count yet.
    Stay.countDocuments({ property, status: 'active', reservationTimer: { $exists: false } }),
  ]);

  const bedsByStatus = Object.fromEntries(BED_STATUSES.map((status) => [status, 0]));
  for (const { _id, count } of statusCounts) bedsByStatus[_id] = count;

  const { min, max } = rent[0] ?? {};
  return {
    totalRooms,
    totalBeds: BED_STATUSES.filter((s) => s !== 'inactive').reduce((sum, s) => sum + bedsByStatus[s], 0),
    bedsByStatus,
    monthlyRentRange: typeof min === 'number' ? { min: toRupees(min), max: toRupees(max) } : null,
    residentsCount,
    // Stub: filled in when rent charges arrive (Phase 4).
    outstandingRent: 0,
  };
};
