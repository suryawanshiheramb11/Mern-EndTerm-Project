import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { serializeBed, serializeRefund, serializeStay } from '../utils/serializers.js';
import * as checkout from '../services/checkout.service.js';
import * as refunds from '../services/refund.service.js';

export const preview = asyncHandler(async (req, res) => {
  ApiResponse.send(res, await checkout.previewCheckout(req.user, req.params.id, req.body), 'Preview only; nothing was changed');
});

export const commit = asyncHandler(async (req, res) => {
  const { stay, refund, freedBed, warnings } = await checkout.commitCheckout(req.user, req.params.id, req.body);
  ApiResponse.send(
    res,
    { stay: serializeStay(stay), refund: serializeRefund(refund), freedBed: freedBed && serializeBed(freedBed), warnings },
    'Checked out',
  );
});

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await refunds.listRefunds(req.user, req.query);
  ApiResponse.send(res, { items: items.map(serializeRefund), pagination });
});

export const get = asyncHandler(async (req, res) => {
  ApiResponse.send(res, { refund: serializeRefund(await refunds.getRefund(req.user, req.params.id)) });
});

export const approve = asyncHandler(async (req, res) => {
  ApiResponse.send(res, { refund: serializeRefund(await refunds.approveRefund(req.user, req.params.id)) }, 'Refund approved');
});

export const pay = asyncHandler(async (req, res) => {
  ApiResponse.send(res, { refund: serializeRefund(await refunds.payRefund(req.user, req.params.id, req.body)) }, 'Refund marked as paid');
});

export const cancel = asyncHandler(async (req, res) => {
  ApiResponse.send(res, { refund: serializeRefund(await refunds.cancelRefund(req.user, req.params.id)) }, 'Refund cancelled');
});
