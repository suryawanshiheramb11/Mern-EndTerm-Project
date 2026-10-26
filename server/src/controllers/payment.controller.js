import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { serializePayment } from '../utils/serializers.js';
import * as paymentService from '../services/payment.service.js';
import { getResidentBalance } from '../services/balance.service.js';
import { loadInScope } from '../services/scope.js';
import { Resident } from '../models/Resident.js';
import { PERMISSIONS } from '../config/permissions.js';

export const record = asyncHandler(async (req, res) => {
  const result = await paymentService.recordPaymentAs(req.user, req.body);
  if (result.dryRun) return ApiResponse.send(res, result, 'Preview only; nothing was recorded');

  const body = {
    payment: serializePayment(result.payment),
    replayed: result.replayed,
    balance: await getResidentBalance(result.payment.resident),
  };
  // A replay returns the original payment untouched (200); a new payment is 201.
  return result.replayed
    ? ApiResponse.send(res, body, 'Payment already recorded')
    : ApiResponse.created(res, body, 'Payment recorded');
});

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await paymentService.listPayments(req.user, req.query);
  ApiResponse.send(res, { items: items.map(serializePayment), pagination });
});

export const get = asyncHandler(async (req, res) => {
  ApiResponse.send(res, { payment: serializePayment(await paymentService.getPayment(req.user, req.params.id)) });
});

export const reverse = asyncHandler(async (req, res) => {
  const { reversal, original } = await paymentService.reversePayment(req.user, req.params.id, req.body);
  ApiResponse.send(
    res,
    {
      reversal: serializePayment(reversal),
      payment: serializePayment(original),
      balance: await getResidentBalance(original.resident),
    },
    'Payment reversed',
  );
});

export const verify = asyncHandler(async (req, res) => {
  const payment = await paymentService.verifyPayment(req.user, req.params.id);
  ApiResponse.send(res, { payment: serializePayment(payment) }, 'Payment verified');
});

export const receipt = asyncHandler(async (req, res) => {
  ApiResponse.send(res, { receipt: await paymentService.getReceipt(req.user, req.params.id) });
});

export const residentBalance = asyncHandler(async (req, res) => {
  const resident = await loadInScope(Resident, req.params.id, req.user, { label: 'Resident', permission: PERMISSIONS.PAYMENTS_VIEW });
  ApiResponse.send(res, { balance: await getResidentBalance(resident._id) });
});
