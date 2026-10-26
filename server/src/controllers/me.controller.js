import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { serializeCharge, serializeComplaint, serializeNotification, serializePayment, serializeRefund, serializeStay } from '../utils/serializers.js';
import * as charges from '../services/charge.service.js';
import * as complaints from '../services/complaint.service.js';
import * as me from '../services/me.service.js';
import * as notifications from '../services/notification.service.js';
import * as payments from '../services/payment.service.js';
import * as refunds from '../services/refund.service.js';

export const summary = asyncHandler(async (req, res) => {
  const s = await me.getSummary(req.user);
  ApiResponse.send(res, { summary: { ...s, stay: s.stay && serializeStay(s.stay) } });
});

export const stay = asyncHandler(async (req, res) => {
  const s = await me.getMyStay(req.user);
  ApiResponse.send(res, { stay: s ? serializeStay(s) : null });
});

export const profile = asyncHandler(async (req, res) => ApiResponse.send(res, await me.getProfile(req.user)));

export const listCharges = asyncHandler(async (req, res) => {
  const { items, pagination } = await charges.listCharges(req.user, req.query);
  ApiResponse.send(res, { items: items.map(serializeCharge), pagination });
});

export const listPayments = asyncHandler(async (req, res) => {
  const { items, pagination } = await payments.listPayments(req.user, req.query);
  ApiResponse.send(res, { items: items.map(serializePayment), pagination });
});

export const receipt = asyncHandler(async (req, res) => {
  ApiResponse.send(res, { receipt: await payments.getReceipt(req.user, req.params.paymentId) });
});

export const listRefunds = asyncHandler(async (req, res) => {
  const { items, pagination } = await refunds.listRefunds(req.user, req.query);
  ApiResponse.send(res, { items: items.map(serializeRefund), pagination });
});

export const listComplaints = asyncHandler(async (req, res) => {
  const { items, pagination } = await complaints.listComplaints(req.user, req.query);
  ApiResponse.send(res, { items: items.map((c) => serializeComplaint(c, req.user, complaints)), pagination });
});

export const createComplaint = asyncHandler(async (req, res) => {
  const complaint = await complaints.createComplaint(req.user, req.body);
  ApiResponse.created(res, { complaint: serializeComplaint(complaint, req.user, complaints) }, 'Complaint raised');
});

export const listNotifications = asyncHandler(async (req, res) => {
  const { items, ...rest } = await notifications.listNotifications(req.user, req.query);
  ApiResponse.send(res, { items: items.map(serializeNotification), ...rest });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  ApiResponse.send(res, { notification: serializeNotification(await notifications.markRead(req.user, req.params.id)) }, 'Marked as read');
});
