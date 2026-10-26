import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { serializeComplaint } from '../utils/serializers.js';
import * as complaints from '../services/complaint.service.js';

const one = (res, user, complaint, message) =>
  ApiResponse.send(res, { complaint: serializeComplaint(complaint, user, complaints) }, message);

export const create = asyncHandler(async (req, res) => {
  const complaint = await complaints.createComplaint(req.user, req.body);
  ApiResponse.created(res, { complaint: serializeComplaint(complaint, req.user, complaints) }, 'Complaint raised');
});

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await complaints.listComplaints(req.user, req.query);
  ApiResponse.send(res, { items: items.map((c) => serializeComplaint(c, req.user, complaints)), pagination });
});

export const summary = asyncHandler(async (req, res) => {
  ApiResponse.send(res, { summary: await complaints.summary(req.user, req.query) });
});

export const assignees = asyncHandler(async (req, res) => {
  ApiResponse.send(res, { items: await complaints.listAssignees(req.user, req.query) });
});

export const get = asyncHandler(async (req, res) => {
  one(res, req.user, await complaints.getComplaint(req.user, req.params.id));
});

const action = (name, message) =>
  asyncHandler(async (req, res) => {
    one(res, req.user, await complaints[name](req.user, req.params.id, req.body), message);
  });

export const acknowledge = action('acknowledge', 'Complaint acknowledged');
export const assign = action('assign', 'Complaint assigned');
export const progress = action('progress', 'Progress recorded');
export const resolve = action('resolve', 'Complaint resolved');
export const close = action('close', 'Complaint closed');
export const reopen = action('reopen', 'Complaint reopened');
