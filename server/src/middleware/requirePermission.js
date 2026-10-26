import mongoose from 'mongoose';
import { asyncHandler } from './asyncHandler.js';
import { assertPropertyAccess } from '../services/propertyAccess.service.js';

/**
 * requirePermission('payments.record') or requirePermission(['reports.view', 'finances.view'])
 * (any one suffices). The property is taken from the route (:propertyId), then the body, then the
 * query. Owners of the property pass; wardens/maintenance need the grant on that property; anyone
 * else is refused. When a request names no property (e.g. a list across all of a user's
 * properties) the middleware steps aside and the service narrows the results with the same
 * permission instead.
 */
export const requirePermission = (permission) =>
  asyncHandler(async (req, _res, next) => {
    const propertyId = req.params.propertyId ?? req.body?.propertyId ?? req.query?.propertyId;
    // A malformed id is left for request validation to report as a 400.
    if (propertyId && mongoose.isValidObjectId(propertyId)) await assertPropertyAccess(req.user, propertyId, { permission });
    next();
  });

export default requirePermission;
