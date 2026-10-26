import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { env } from '../config/env.js';
import { serializeResident } from '../utils/serializers.js';
import * as residentService from '../services/resident.service.js';

export const create = asyncHandler(async (req, res) => {
  const resident = await residentService.createResident(req.user, req.body);
  ApiResponse.created(res, { resident: serializeResident(resident) }, 'Resident created');
});

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await residentService.listResidents(req.user, req.query);
  ApiResponse.send(res, {
    items: items.map(({ resident, currentStay }) => serializeResident(resident, { currentStay: currentStay ?? null })),
    pagination,
  });
});

export const get = asyncHandler(async (req, res) => {
  const resident = await residentService.getResident(req.user, req.params.id);
  ApiResponse.send(res, { resident: serializeResident(resident) });
});

export const update = asyncHandler(async (req, res) => {
  const resident = await residentService.updateResident(req.user, req.params.id, req.body);
  ApiResponse.send(res, { resident: serializeResident(resident) }, 'Resident updated');
});

// The raw invite token is only returned outside production, where there's no email provider yet.
export const invite = asyncHandler(async (req, res) => {
  const { resident, user, token } = await residentService.inviteResidentById(req.user, req.params.id);
  ApiResponse.created(
    res,
    { resident: serializeResident(resident), user: user.toSafeJSON(), ...(!env.isProd && { inviteToken: token }) },
    'Invite created',
  );
});
