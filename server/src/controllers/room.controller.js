import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { serializeRoom } from '../utils/serializers.js';
import * as roomService from '../services/room.service.js';

export const create = asyncHandler(async (req, res) => {
  const room = await roomService.createRoom(req.params.propertyId, req.body);
  ApiResponse.created(res, { room: serializeRoom(room) }, 'Room created');
});

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await roomService.listRooms(req.params.propertyId, req.query);
  ApiResponse.send(res, { items: items.map(serializeRoom), pagination });
});

export const get = asyncHandler(async (req, res) => {
  const room = await roomService.getRoom(req.params.propertyId, req.params.roomId);
  ApiResponse.send(res, { room: serializeRoom(room) });
});

export const update = asyncHandler(async (req, res) => {
  const room = await roomService.updateRoom(req.params.propertyId, req.params.roomId, req.body);
  ApiResponse.send(res, { room: serializeRoom(room) }, 'Room updated');
});

export const remove = asyncHandler(async (req, res) => {
  const room = await roomService.deactivateRoom(req.params.propertyId, req.params.roomId);
  ApiResponse.send(res, { room: serializeRoom(room) }, 'Room deactivated');
});
