import mongoose from 'mongoose';
import { Resident } from '../models/Resident.js';
import { ApiError } from '../utils/ApiError.js';
import { assertPropertyAccess, getUserPropertyIds } from './propertyAccess.service.js';

export const studentResidentIds = (user) => Resident.find({ userId: user._id }).distinct('_id');

// Students only ever see records of their own resident profile(s), whatever the property.
const assertOwnRecord = async (user, Model, doc) => {
  const ids = await studentResidentIds(user);
  const owner = Model.modelName === 'Resident' ? doc._id : doc.resident;
  if (!owner || !ids.some((id) => id.equals(owner))) throw ApiError.notFound('Not found');
};

/**
 * Loads a property-scoped document by id and checks the caller's access to its property.
 * Missing and inaccessible documents are both 404; a missing write permission is 403.
 */
export const loadInScope = async (Model, id, user, { label, permission: required }) => {
  // Staff permissions gate staff access; students are limited to their own records below.
  const permission = user.role === 'student' ? undefined : required;
  const doc = mongoose.isValidObjectId(id) ? await Model.findById(id) : null;
  if (!doc) throw ApiError.notFound(`${label} not found`);

  if (user.role === 'student') {
    try {
      await assertOwnRecord(user, Model, doc);
    } catch {
      throw ApiError.notFound(`${label} not found`);
    }
  }

  try {
    await assertPropertyAccess(user, doc.property, { permission });
  } catch (err) {
    if (err.statusCode === 404) throw ApiError.notFound(`${label} not found`);
    throw err;
  }
  return doc;
};

/**
 * Base filter for list endpoints over property-scoped records that carry a `resident`.
 * Staff are scoped by property; students by their own resident profile(s), whatever the property.
 */
export const scopeFilter = async (user, propertyId, residentId, { permission } = {}) => {
  if (user.role === 'student') {
    const own = await studentResidentIds(user);
    const allowed = residentId ? own.filter((id) => id.equals(residentId)) : own;
    return { resident: { $in: allowed }, ...(propertyId && { property: propertyId }) };
  }
  let property;
  if (propertyId) {
    await assertPropertyAccess(user, propertyId, { permission });
    property = propertyId;
  } else {
    property = { $in: await getUserPropertyIds(user, { permission }) };
  }
  return { property, ...(residentId && { resident: residentId }) };
};
