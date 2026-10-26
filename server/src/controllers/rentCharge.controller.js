import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { serializeCharge } from '../utils/serializers.js';
import * as chargeService from '../services/charge.service.js';
import { reconcileOverdue } from '../services/reconcile.service.js';
import { assertPropertyAccess, getUserPropertyIds } from '../services/propertyAccess.service.js';

export const generate = asyncHandler(async (req, res) => {
  const result = await chargeService.generate(req.user, req.body);
  ApiResponse.send(res, result, result.dryRun ? 'Preview only; nothing was created' : `${result.created} charge(s) created, ${result.skipped} skipped`);
});

export const reconcile = asyncHandler(async (req, res) => {
  const { propertyId } = req.body;
  if (propertyId) await assertPropertyAccess(req.user, propertyId);
  const ids = propertyId ? [propertyId] : await getUserPropertyIds(req.user);
  const totals = { markedOverdue: 0, reopened: 0 };
  for (const id of ids) {
    const r = await reconcileOverdue(id);
    totals.markedOverdue += r.markedOverdue;
    totals.reopened += r.reopened;
  }
  ApiResponse.send(res, totals, 'Reconciled');
});

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await chargeService.listCharges(req.user, req.query);
  ApiResponse.send(res, { items: items.map(serializeCharge), pagination });
});

export const get = asyncHandler(async (req, res) => {
  ApiResponse.send(res, { charge: serializeCharge(await chargeService.getCharge(req.user, req.params.id)) });
});

export const update = asyncHandler(async (req, res) => {
  const charge = await chargeService.updateCharge(req.user, req.params.id, req.body);
  ApiResponse.send(res, { charge: serializeCharge(charge) }, 'Charge updated');
});

export const adjust = asyncHandler(async (req, res) => {
  const charge = await chargeService.adjustCharge(req.user, req.params.id, req.body);
  ApiResponse.send(res, { charge: serializeCharge(charge) }, 'Adjustment recorded');
});

export const waive = asyncHandler(async (req, res) => {
  const charge = await chargeService.waiveCharge(req.user, req.params.id, req.body);
  ApiResponse.send(res, { charge: serializeCharge(charge) }, 'Charge waived');
});
