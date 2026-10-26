import mongoose from 'mongoose';
import { toRupees } from './money.js';

const base = (doc) => {
  const obj = { ...(doc.toObject ? doc.toObject() : doc) };
  const id = String(obj._id);
  delete obj._id;
  delete obj.__v;
  return { id, ...obj };
};

const rupees = (obj, ...fields) => {
  for (const field of fields) {
    if (typeof obj[field] === 'number') obj[field] = toRupees(obj[field]);
  }
  return obj;
};

export const serializeProperty = (property) => base(property);
export const serializeRoom = (room) => rupees(base(room), 'defaultMonthlyRent', 'defaultDeposit');
export const serializeBed = (bed) => rupees(base(bed), 'monthlyRent');

const isId = (value) => value instanceof mongoose.Types.ObjectId;

// Populated references become { id, ...picked } so lists are self-describing.
const expand = (value, pick) => {
  if (!value || isId(value)) return value;
  return { id: String(value._id), ...Object.fromEntries(pick.map((k) => [k, value[k]])) };
};

export const serializeResident = (resident, extra = {}) => ({ ...base(resident), ...extra });

// Stay amounts are integer paise (monthlyRentPaise, depositPaise, ...) and are returned as stored.
export const serializeStay = (stay) => {
  const out = base(stay);
  out.resident = expand(out.resident, ['fullName', 'phone']);
  out.room = expand(out.room, ['number', 'floor']);
  out.bed = expand(out.bed, ['label', 'status']);
  return out;
};

// Charge/payment amounts are integer paise, returned as stored. outstandingPaise is derived here
// from the stored fields so every consumer sees the same number.
export const serializeCharge = (charge) => {
  const out = base(charge);
  out.resident = expand(out.resident, ['fullName', 'phone']);
  out.stay = expand(out.stay, ['status']);
  out.outstandingPaise = out.status === 'waived' ? 0 : Math.max(out.netDuePaise - out.paidPaise, 0);
  return out;
};

export const serializePayment = (payment) => {
  const out = base(payment);
  out.resident = expand(out.resident, ['fullName', 'phone']);
  out.receivedBy = expand(out.receivedBy, ['name']);
  out.allocations = (out.allocations ?? []).map((a) => ({ charge: expand(a.charge, ['periodKey']), amountPaise: a.amountPaise }));
  delete out.idempotencyKey; // internal, namespaced
  return out;
};

export const serializeRefund = (refund) => {
  const out = base(refund);
  out.resident = expand(out.resident, ['fullName', 'phone']);
  out.stay = expand(out.stay, ['checkInDate', 'actualCheckOutDate']);
  return out;
};

// `service` supplies the per-viewer permission and SLA helpers so the API, not the UI, decides what
// a user may do next.
export const serializeComplaint = (complaint, viewer, service) => {
  const out = base(complaint);
  out.resident = expand(out.resident, ['fullName', 'phone']);
  out.assignedTo = expand(out.assignedTo, ['name', 'role']);
  out.room = expand(out.room, ['number']);
  out.bed = expand(out.bed, ['label']);
  out.statusHistory = (out.statusHistory ?? []).map((h) => ({
    id: String(h._id),
    status: h.status,
    fromStatus: h.fromStatus,
    by: expand(h.by, ['name', 'role']),
    at: h.at,
    assignedTo: expand(h.assignedTo, ['name']),
    note: h.note,
    progressNote: h.progressNote,
    completionPhotoUrl: h.completionPhotoUrl,
  }));
  out.slaState = service.slaState(complaint);
  out.actions = service.allowedActions(viewer, complaint);
  return out;
};

export const serializeExpense = (expense) => base(expense);
export const serializeNotification = (notification) => base(notification);
