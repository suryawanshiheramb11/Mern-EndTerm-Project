import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { serializeProperty } from '../utils/serializers.js';
import * as propertyService from '../services/property.service.js';

export const create = asyncHandler(async (req, res) => {
  const property = await propertyService.createProperty(req.user, req.body);
  ApiResponse.created(res, { property: serializeProperty(property) }, 'Property created');
});

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await propertyService.listProperties(req.user, req.query);
  ApiResponse.send(res, { items: items.map(serializeProperty), pagination });
});

export const get = asyncHandler(async (req, res) => {
  const property = await propertyService.getProperty(req.params.propertyId);
  ApiResponse.send(res, { property: serializeProperty(property) });
});

export const update = asyncHandler(async (req, res) => {
  const property = await propertyService.updateProperty(req.params.propertyId, req.body);
  ApiResponse.send(res, { property: serializeProperty(property) }, 'Property updated');
});

export const remove = asyncHandler(async (req, res) => {
  const property = await propertyService.deactivateProperty(req.params.propertyId);
  ApiResponse.send(res, { property: serializeProperty(property) }, 'Property deactivated');
});

export const overview = asyncHandler(async (req, res) => {
  ApiResponse.send(res, { overview: await propertyService.getOverview(req.params.propertyId) });
});
