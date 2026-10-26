import { asyncHandler } from './asyncHandler.js';
import { assertPropertyAccess } from '../services/propertyAccess.service.js';

// Must run before any handler touches child resources (rooms, beds, ...) of :propertyId.
export const requirePropertyAccess = (permission) =>
  asyncHandler(async (req, _res, next) => {
    await assertPropertyAccess(req.user, req.params.propertyId, { permission });
    next();
  });

export default requirePropertyAccess;
