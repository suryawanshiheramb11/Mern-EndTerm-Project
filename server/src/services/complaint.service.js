import mongoose from 'mongoose';
import { Complaint, OPEN_STATUSES } from '../models/Complaint.js';
import { Stay } from '../models/Stay.js';
import { Property } from '../models/Property.js';
import { User } from '../models/User.js';
import { PERMISSIONS } from '../config/permissions.js';
import { runAtomic } from '../config/transactions.js';
import { ApiError } from '../utils/ApiError.js';
import { businessToday } from '../utils/dates.js';
import { pageMeta, paginate } from '../utils/pagination.js';
import { writeAudit } from './audit.service.js';
import { notify } from './notification.service.js';
import { nextSeq } from './counter.service.js';
import { ensurePropertyCode } from './payment.service.js';
import { assertPropertyAccess, getUserPropertyIds } from './propertyAccess.service.js';
import { loadInScope, studentResidentIds } from './scope.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const SLA_DAYS = { high: 1, medium: 3, low: 7 };
const REOPEN_WINDOW_DAYS = 14;
const MAX_REOPENS = 3;

export const slaDueFor = (urgency, from = new Date()) => new Date(from.getTime() + SLA_DAYS[urgency] * DAY_MS);

const fieldError = (field, message) => ApiError.badRequest('Validation failed', [{ field, message }]);
const invalid = (action, status) => ApiError.conflict(`Cannot ${action} a complaint that is ${status.replace('_', ' ')}`);
const isStaff = (user) => user.role === 'owner' || user.role === 'warden';

/* ---------- what the current user may do (the API returns this; the UI just renders it) ---------- */

const withinReopenWindow = (c, now = new Date()) =>
  Boolean(c.resolvedAt) && now - c.resolvedAt <= REOPEN_WINDOW_DAYS * DAY_MS && c.reopenedCount < MAX_REOPENS;

export const allowedActions = (user, c) => {
  const actions = [];
  const assignee = c.assignedTo && String(c.assignedTo._id ?? c.assignedTo) === String(user._id);
  if (isStaff(user)) {
    if (c.status === 'new') actions.push('acknowledge');
    if (['acknowledged', 'assigned', 'in_progress', 'reopened'].includes(c.status)) actions.push('assign');
    if (c.status === 'resolved') actions.push('close');
    if (['resolved', 'closed'].includes(c.status)) actions.push('reopen');
  }
  if (user.role === 'student' && ['resolved', 'closed'].includes(c.status) && withinReopenWindow(c)) actions.push('reopen');
  if (user.role === 'owner' || assignee) {
    if (c.assignedTo && ['assigned', 'in_progress', 'reopened'].includes(c.status)) actions.push('progress');
    if (c.status === 'in_progress') actions.push('resolve');
  }
  return actions;
};

export const slaState = (c, now = new Date()) => {
  if (!c.slaDueAt || !OPEN_STATUSES.includes(c.status)) return null;
  if (now > c.slaDueAt) return 'overdue';
  const total = SLA_DAYS[c.urgency] * DAY_MS;
  return c.slaDueAt - now <= total / 4 ? 'due_soon' : 'ok';
};

/* ---------- loading ---------- */

// Students: own complaints (enforced by loadInScope). Maintenance: only ones assigned to them.
const load = async (user, id, permission) => {
  const complaint = await loadInScope(Complaint, id, user, { label: 'Complaint', permission });
  if (user.role === 'maintenance' && String(complaint.assignedTo) !== String(user._id)) {
    throw ApiError.notFound('Complaint not found');
  }
  return complaint;
};

const populate = (query) =>
  query
    .populate('resident', 'fullName phone')
    .populate('assignedTo', 'name role')
    .populate('room', 'number')
    .populate('bed', 'label')
    .populate('statusHistory.by', 'name role')
    .populate('statusHistory.assignedTo', 'name');

/* ---------- transitions ---------- */

/**
 * Applies one status change as a conditional update (the current status is part of the filter, so
 * concurrent requests cannot both win), appends to statusHistory and writes the audit row. History
 * is only ever pushed to; the rollback path removes just the entry this call added when a later
 * step of the same call fails.
 */
const transition = async (user, complaint, { action, to, set = {}, inc, entry = {} }) => {
  const from = complaint.status;
  const historyId = new mongoose.Types.ObjectId();
  const now = new Date();

  const updated = await runAtomic(async ({ session, onRollback }) => {
    const doc = await Complaint.findOneAndUpdate(
      { _id: complaint._id, status: from },
      {
        $set: { status: to, ...set },
        ...(inc && { $inc: inc }),
        $push: { statusHistory: { _id: historyId, status: to, fromStatus: from, by: user._id, at: now, ...entry } },
      },
      { new: true, session },
    );
    if (!doc) throw ApiError.conflict('Complaint was changed by someone else; reload and retry');

    const previous = { status: from };
    const unset = {};
    for (const key of Object.keys(set)) {
      if (complaint[key] === undefined) unset[key] = 1;
      else previous[key] = complaint[key];
    }
    onRollback(() =>
      Complaint.updateOne(
        { _id: complaint._id },
        { $set: previous, ...(Object.keys(unset).length && { $unset: unset }), $pull: { statusHistory: { _id: historyId } }, ...(inc && { $inc: Object.fromEntries(Object.keys(inc).map((k) => [k, -inc[k]])) }) },
      ),
    );

    await writeAudit(
      {
        user,
        action: `complaint.${action}`,
        entity: 'Complaint',
        entityId: complaint._id,
        property: complaint.property,
        before: { status: from, assignedTo: complaint.assignedTo },
        after: { status: to, ...(set.assignedTo && { assignedTo: set.assignedTo }) },
        meta: { complaintNumber: complaint.complaintNumber, ...(entry.note && { note: entry.note }) },
      },
      session,
    );
    return doc;
  });
  return populate(Complaint.findById(updated._id)).lean();
};

export const acknowledge = async (user, id, { note } = {}) => {
  const c = await load(user, id, PERMISSIONS.COMPLAINTS_MANAGE);
  if (c.status !== 'new') throw invalid('acknowledge', c.status);
  return transition(user, c, { action: 'acknowledge', to: 'acknowledged', entry: { note } });
};

export const assign = async (user, id, { assignedTo, priority }) => {
  const c = await load(user, id, PERMISSIONS.COMPLAINTS_MANAGE);
  if (!['acknowledged', 'assigned', 'in_progress', 'reopened'].includes(c.status)) throw invalid('assign', c.status);

  const assignee = await User.findOne({ _id: assignedTo, status: 'active' });
  if (!assignee || !['warden', 'maintenance'].includes(assignee.role)) {
    throw fieldError('assignedTo', 'Must be an active warden or maintenance user');
  }
  try {
    await assertPropertyAccess(assignee, c.property);
  } catch {
    throw fieldError('assignedTo', 'That user has no access to this property');
  }

  // First assignment moves acknowledged -> assigned; re-assigning keeps the current status.
  const to = c.status === 'acknowledged' ? 'assigned' : c.status;
  const updated = await transition(user, c, {
    action: 'assign',
    to,
    set: { assignedTo: assignee._id, priority },
    entry: { assignedTo: assignee._id, note: c.assignedTo ? 'Reassigned' : undefined },
  });
  // The history length distinguishes a later re-assignment to the same person from a repeat call.
  await notify('task_assigned', { complaint: updated, assigneeId: assignee._id, seq: updated.statusHistory.length });
  return updated;
};

const requireAssigneeOrOwner = (user, c) => {
  if (user.role === 'owner' || (c.assignedTo && String(c.assignedTo) === String(user._id))) return;
  throw ApiError.forbidden('Only the assigned user or an owner can do this');
};

export const progress = async (user, id, { progressNote, photoUrl }) => {
  const c = await load(user, id);
  requireAssigneeOrOwner(user, c);
  if (!c.assignedTo || !['assigned', 'in_progress', 'reopened'].includes(c.status)) throw invalid('add progress to', c.status);
  return transition(user, c, {
    action: 'progress',
    to: 'in_progress',
    entry: { progressNote, ...(photoUrl && { completionPhotoUrl: photoUrl }) },
  });
};

export const resolve = async (user, id, { resolutionNotes, completionPhotoUrl }) => {
  const c = await load(user, id);
  requireAssigneeOrOwner(user, c);
  if (c.status !== 'in_progress') throw invalid('resolve', c.status);
  const updated = await transition(user, c, {
    action: 'resolve',
    to: 'resolved',
    set: { resolutionNotes, resolvedAt: new Date(), closedAt: null },
    entry: { note: resolutionNotes, ...(completionPhotoUrl && { completionPhotoUrl }) },
  });
  await notify('complaint_resolved', { complaint: updated });
  return updated;
};

export const close = async (user, id, { note } = {}) => {
  const c = await load(user, id, PERMISSIONS.COMPLAINTS_MANAGE);
  if (c.status !== 'resolved') throw invalid('close', c.status);
  return transition(user, c, { action: 'close', to: 'closed', set: { closedAt: new Date() }, entry: { note } });
};

/**
 * Students may reopen their own resolved/closed complaint within 14 days of resolution, at most 3
 * times. Staff (owner/warden) may reopen without those limits. SLA restarts from now.
 */
export const reopen = async (user, id, { reason }) => {
  const c = await load(user, id, PERMISSIONS.COMPLAINTS_MANAGE); // students are scoped by ownership instead
  if (!['resolved', 'closed'].includes(c.status)) throw invalid('reopen', c.status);
  if (user.role === 'student') {
    if (c.reopenedCount >= MAX_REOPENS) throw ApiError.conflict(`A complaint can be reopened at most ${MAX_REOPENS} times`);
    if (!withinReopenWindow(c)) throw ApiError.conflict(`Complaints can only be reopened within ${REOPEN_WINDOW_DAYS} days of resolution`);
  } else if (!isStaff(user)) {
    throw ApiError.forbidden('Insufficient permissions');
  }
  const now = new Date();
  return transition(user, c, {
    action: 'reopen',
    to: 'reopened',
    set: { reopenedAt: now, slaDueAt: slaDueFor(c.urgency, now) },
    inc: { reopenedCount: 1 },
    entry: { note: reason },
  });
};

/* ---------- create / read ---------- */

export const createComplaint = async (user, input) => {
  const residents = await studentResidentIds(user);
  const stay = await Stay.findOne({ resident: { $in: residents }, status: 'active', reservationTimer: { $exists: false } }).lean();
  if (!stay) throw ApiError.conflict('You need an active stay to raise a complaint');

  const property = await Property.findById(stay.property).lean();
  const code = await ensurePropertyCode(property);
  const now = new Date();
  const _id = new mongoose.Types.ObjectId();

  const complaint = await runAtomic(async ({ session }) => {
    const seq = await nextSeq(`complaint:${code}`, session);
    const [doc] = await Complaint.create(
      [
        {
          _id,
          property: stay.property,
          resident: stay.resident,
          stay: stay._id,
          room: stay.room,
          bed: stay.bed,
          complaintNumber: `CMP-${code}-${String(seq).padStart(4, '0')}`,
          category: input.category,
          title: input.title,
          description: input.description,
          urgency: input.urgency,
          attachments: (input.attachments ?? []).map((a) => ({ ...a, uploadedBy: user._id, at: now })),
          slaDueAt: slaDueFor(input.urgency, now),
          statusHistory: [{ status: 'new', fromStatus: null, by: user._id, at: now }],
        },
      ],
      { session },
    );
    await writeAudit(
      { user, action: 'complaint.create', entity: 'Complaint', entityId: _id, property: stay.property, after: { status: 'new' }, meta: { complaintNumber: doc.complaintNumber } },
      session,
    );
    return doc;
  });
  const created = await populate(Complaint.findById(complaint._id)).lean();
  await notify('complaint_created', { complaint: created });
  return created;
};

export const getComplaint = async (user, id) => {
  const c = await load(user, id);
  return populate(Complaint.findById(c._id)).lean();
};

// Builds the property/role scope. Students are forced to their own complaints and a supplied
// propertyId is ignored; maintenance sees only what is assigned to them.
const scopeFor = async (user, propertyId, { permission } = {}) => {
  if (user.role === 'student') return { resident: { $in: await studentResidentIds(user) } };
  let property;
  if (propertyId) {
    await assertPropertyAccess(user, propertyId, { permission });
    property = propertyId;
  } else {
    property = { $in: await getUserPropertyIds(user, { permission }) };
  }
  return { property, ...(user.role === 'maintenance' && { assignedTo: user._id }) };
};

export const listComplaints = async (user, { propertyId, status, priority, category, assignedTo, overdueOnly, ...paging }) => {
  const filter = await scopeFor(user, propertyId);
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (category) filter.category = category;
  if (assignedTo && user.role !== 'maintenance') filter.assignedTo = assignedTo;
  if (overdueOnly) {
    filter.status = status && OPEN_STATUSES.includes(status) ? status : { $in: OPEN_STATUSES };
    filter.slaDueAt = { $lt: new Date() };
  }
  const [items, total] = await Promise.all([
    populate(Complaint.find(filter).sort({ createdAt: -1 }).skip(paginate(paging).skip).limit(paging.limit)).lean(),
    Complaint.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(paging, total) };
};

export const summary = async (user, { propertyId }) => {
  const scope = await scopeFor(user, propertyId, { permission: PERMISSIONS.COMPLAINTS_MANAGE });
  const now = new Date();
  const startOfToday = new Date(businessToday().getTime() - 330 * 60 * 1000); // IST midnight
  const count = (extra) => Complaint.countDocuments({ ...scope, ...extra });
  // aggregate() does not cast ids the way find()/countDocuments() do.
  const aggregateScope = typeof scope.property === 'string' ? { ...scope, property: new mongoose.Types.ObjectId(scope.property) } : scope;

  const [open, assigned, inProgress, resolvedToday, closed, overdue, byPriority] = await Promise.all([
    count({ status: { $in: ['new', 'acknowledged', 'reopened'] } }),
    count({ status: 'assigned' }),
    count({ status: 'in_progress' }),
    count({ status: { $in: ['resolved', 'closed'] }, resolvedAt: { $gte: startOfToday } }),
    count({ status: 'closed' }),
    count({ status: { $in: OPEN_STATUSES }, slaDueAt: { $lt: now } }),
    Complaint.aggregate([{ $match: { ...aggregateScope, status: { $in: OPEN_STATUSES } } }, { $group: { _id: { $ifNull: ['$priority', 'unset'] }, n: { $sum: 1 } } }]),
  ]);
  return {
    open, assigned, inProgress, resolvedToday, closed, overdue,
    byPriority: { urgent: 0, high: 0, medium: 0, low: 0, unset: 0, ...Object.fromEntries(byPriority.map((r) => [r._id, r.n])) },
  };
};

/** Staff who can be assigned complaints at a property (active wardens/maintenance with access). */
export const listAssignees = async (user, { propertyId }) => {
  await assertPropertyAccess(user, propertyId, { permission: PERMISSIONS.COMPLAINTS_MANAGE });
  const users = await User.find({ role: { $in: ['warden', 'maintenance'] }, status: 'active', 'propertyAccess.property': propertyId }, { name: 1, role: 1 }).lean();
  return users.map((u) => ({ id: String(u._id), name: u.name, role: u.role }));
};
