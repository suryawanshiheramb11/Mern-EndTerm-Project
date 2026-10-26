import { asyncHandler } from '../middleware/asyncHandler.js';
import { env } from '../config/env.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import * as staff from '../services/staff.service.js';

export const invite = asyncHandler(async (req, res) => {
  const { user, token } = await staff.inviteStaff(req.user, req.params.propertyId, req.body);
  // The raw token is only returned outside production, where there is no mail provider to rely on.
  ApiResponse.created(res, { user, ...(!env.isProd && { inviteToken: token }) }, 'Invite created');
});
export const list = asyncHandler(async (req, res) => ApiResponse.send(res, { items: await staff.listStaff(req.user, req.params.propertyId) }));
export const update = asyncHandler(async (req, res) => {
  ApiResponse.send(res, { user: await staff.updateStaff(req.user, req.params.propertyId, req.params.userId, req.body) }, 'Access updated');
});
export const revoke = asyncHandler(async (req, res) => {
  ApiResponse.send(res, await staff.revokeStaff(req.user, req.params.propertyId, req.params.userId), 'Access revoked');
});
