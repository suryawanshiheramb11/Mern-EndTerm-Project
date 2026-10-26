import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { serializeBed } from '../utils/serializers.js';
import * as bedService from '../services/bed.service.js';

export const create = asyncHandler(async (req, res) => {
  const { propertyId, roomId } = req.params;
  const bed = await bedService.createBed(propertyId, roomId, req.body);
  ApiResponse.created(res, { bed: serializeBed(bed) }, 'Bed created');
});

export const createBulk = asyncHandler(async (req, res) => {
  const { propertyId, roomId } = req.params;
  const beds = await bedService.createBedsBulk(propertyId, roomId, req.body);
  ApiResponse.created(res, { items: beds.map(serializeBed) }, 'Beds created');
});

export const listForProperty = asyncHandler(async (req, res) => {
  const { items, pagination } = await bedService.listBeds(req.params.propertyId, req.query);
  ApiResponse.send(res, { items: items.map(serializeBed), pagination });
});

export const listForRoom = asyncHandler(async (req, res) => {
  const { propertyId, roomId } = req.params;
  const { items, pagination } = await bedService.listRoomBeds(propertyId, roomId, req.query);
  ApiResponse.send(res, { items: items.map(serializeBed), pagination });
});

export const update = asyncHandler(async (req, res) => {
  const { propertyId, roomId, bedId } = req.params;
  const bed = await bedService.updateBed(propertyId, roomId, bedId, req.body);
  ApiResponse.send(res, { bed: serializeBed(bed) }, 'Bed updated');
});

export const remove = asyncHandler(async (req, res) => {
  const { propertyId, roomId, bedId } = req.params;
  const bed = await bedService.deactivateBed(propertyId, roomId, bedId);
  ApiResponse.send(res, { bed: serializeBed(bed) }, 'Bed deactivated');
});
