import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { env } from '../config/env.js';
import { serializeResident as serialize } from '../utils/serializers.js';
import * as residentService from '../services/resident.service.js';

// Maintenance staff can see who lives where, not personal, guardian or health details.
const PRIVATE = ['guardian', 'medical', 'dateOfBirth', 'permanentAddress', 'gender', 'idVerification'];
const serializeResident = (resident, extra, viewer) => {
  const out = serialize(resident, extra);
  if (viewer?.role === 'maintenance') for (const k of PRIVATE) delete out[k];
  return out;
};

export const create = asyncHandler(async (req, res) => {
  const resident = await residentService.createResident(req.user, req.body);
  ApiResponse.created(res, { resident: serializeResident(resident, {}, req.user) }, 'Resident created');
});

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await residentService.listResidents(req.user, req.query);
  ApiResponse.send(res, {
    items: items.map(({ resident, currentStay }) => serializeResident(resident, { currentStay: currentStay ?? null }, req.user)),
    pagination,
  });
});

export const get = asyncHandler(async (req, res) => {
  const resident = await residentService.getResident(req.user, req.params.id);
  ApiResponse.send(res, { resident: serializeResident(resident, {}, req.user) });
});

export const update = asyncHandler(async (req, res) => {
  const resident = await residentService.updateResident(req.user, req.params.id, req.body);
  ApiResponse.send(res, { resident: serializeResident(resident, {}, req.user) }, 'Resident updated');
});

// The raw invite token is only returned outside production, where there's no email provider yet.
export const invite = asyncHandler(async (req, res) => {
  const { resident, user, token } = await residentService.inviteResidentById(req.user, req.params.id);
  ApiResponse.created(
    res,
    { resident: serializeResident(resident, {}, req.user), user: user.toSafeJSON(), ...(!env.isProd && { inviteToken: token }) },
    'Invite created',
  );
});

// Returned once, in the body only.
export const credentials = asyncHandler(async (req, res) => {
  const { resident, user, temporaryPassword, created } = await residentService.setResidentCredentials(req.user, req.params.id, req.body);
  res.set('Cache-Control', 'no-store');
  const body = { resident: serializeResident(resident, {}, req.user), user: user.toSafeJSON(), temporaryPassword };
  if (created) ApiResponse.created(res, body, 'Login created');
  else ApiResponse.send(res, body, 'Password reset');
});

export const changeEmail = asyncHandler(async (req, res) => {
  const { resident, user } = await residentService.changeResidentEmail(req.user, req.params.id, req.body);
  ApiResponse.send(res, { resident: serializeResident(resident, {}, req.user), user: user?.toSafeJSON() ?? null }, 'Email updated');
});
