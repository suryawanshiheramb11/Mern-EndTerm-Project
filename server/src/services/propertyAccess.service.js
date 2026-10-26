import mongoose from 'mongoose';
import { Property } from '../models/Property.js';
import { Resident } from '../models/Resident.js';
import { Stay } from '../models/Stay.js';
import { grantSatisfies } from '../config/permissions.js';
import { ApiError } from '../utils/ApiError.js';

/*
 * Property-scope semantics:
 *   owner        -> properties where Property.owner === user._id
 *   warden/staff -> only properties listed in user.propertyAccess, with the required permission
 *   student      -> only the property of their active stay (via Resident.userId)
 *   maintenance  -> only assigned properties (user.propertyAccess), read-only finances
 *
 * Deactivated properties are invisible to everyone. Inaccessible and non-existent properties
 * are indistinguishable (404) so ids of other tenants' properties can't be probed.
 */

// A required permission may be a string or a list (any one suffices).
const holds = (user, propertyId, required) => {
  const entry = user.propertyAccess.find((e) => String(e.property) === String(propertyId));
  const granted = entry?.permissions ?? [];
  return [].concat(required).some((r) => grantSatisfies(granted, r));
};

/**
 * Ids of the properties the user can reach. With `permission`, staff are narrowed to properties
 * where they hold it (owners hold everything; students are scoped by ownership elsewhere).
 */
export const getUserPropertyIds = async (user, { permission } = {}) => {
  if (user.role === 'owner') {
    return Property.find({ owner: user._id, isActive: true }).distinct('_id');
  }
  if (user.role === 'warden' || user.role === 'maintenance') {
    const granted = user.propertyAccess
      .filter((entry) => !permission || holds(user, entry.property, permission))
      .map((entry) => entry.property);
    return Property.find({ _id: { $in: granted }, isActive: true }).distinct('_id');
  }
  if (user.role === 'student') {
    const residents = await Resident.find({ userId: user._id }).distinct('_id');
    const propertyIds = await Stay.find({ resident: { $in: residents }, status: 'active' }).distinct('property');
    return Property.find({ _id: { $in: propertyIds }, isActive: true }).distinct('_id');
  }
  return [];
};

const canReach = async (user, propertyId) => {
  if (user.role === 'owner') return Property.exists({ _id: propertyId, owner: user._id, isActive: true });
  if (user.role === 'warden' || user.role === 'maintenance') {
    const granted = user.propertyAccess.some((entry) => String(entry.property) === propertyId);
    return granted && Property.exists({ _id: propertyId, isActive: true });
  }
  if (user.role === 'student') {
    // Students keep read access to the property of any stay they had, so history survives check-out.
    const residents = await Resident.find({ userId: user._id }).distinct('_id');
    const propertyIds = (await Stay.find({ resident: { $in: residents } }).distinct('property')).map(String);
    return propertyIds.includes(propertyId) && Property.exists({ _id: propertyId, isActive: true });
  }
  return false;
};

/**
 * Throws 404 when the user can't reach the property, 403 when they can reach it but lack the
 * requested write permission. Only owners and wardens can hold write permissions.
 */
export const assertPropertyAccess = async (user, propertyId, { permission } = {}) => {
  const id = String(propertyId);
  if (!mongoose.isValidObjectId(id) || !(await canReach(user, id))) {
    throw ApiError.notFound('Property not found');
  }
  if (!permission || user.role === 'owner') return;

  // Staff (wardens and maintenance) can hold permissions; nobody else can.
  if ((user.role !== 'warden' && user.role !== 'maintenance') || !holds(user, id, permission)) {
    throw ApiError.forbidden('You do not have permission to perform this action');
  }
};
