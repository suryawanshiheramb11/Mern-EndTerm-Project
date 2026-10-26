import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { env } from '../config/env.js';
import { serializeBed, serializeStay } from '../utils/serializers.js';
import * as stayService from '../services/stay.service.js';

const outcome = ({ stay, bed, previousStay, releasedBed }) => ({
  stay: serializeStay(stay),
  bed: serializeBed(bed),
  ...(previousStay && { previousStay: serializeStay(previousStay), releasedBed: serializeBed(releasedBed) }),
});

export const create = asyncHandler(async (req, res) => {
  const result = await stayService.createStay(req.user, req.body);
  const body = outcome(result);
  if (result.invite) {
    body.invite = { user: result.invite.user.toSafeJSON(), ...(!env.isProd && { inviteToken: result.invite.token }) };
  }
  if (result.inviteError) body.inviteError = result.inviteError;
  ApiResponse.created(res, body, req.body.action === 'reserve' ? 'Bed reserved' : 'Checked in');
});

export const transfer = asyncHandler(async (req, res) => {
  const result = await stayService.transferStay(req.user, req.params.id, req.body);
  ApiResponse.send(res, outcome(result), 'Resident transferred');
});

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await stayService.listStays(req.user, req.query);
  ApiResponse.send(res, { items: items.map(serializeStay), pagination });
});

export const get = asyncHandler(async (req, res) => {
  ApiResponse.send(res, { stay: serializeStay(await stayService.getStay(req.user, req.params.id)) });
});
