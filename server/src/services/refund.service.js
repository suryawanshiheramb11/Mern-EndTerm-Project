import { Refund } from '../models/Refund.js';
import { PERMISSIONS } from '../config/permissions.js';
import { runAtomic } from '../config/transactions.js';
import { ApiError } from '../utils/ApiError.js';
import { pageMeta, paginate } from '../utils/pagination.js';
import { writeAudit } from './audit.service.js';
import { loadInScope, scopeFilter } from './scope.js';

const populateRefund = (query) => query.populate('resident', 'fullName phone').populate('stay', 'checkInDate actualCheckOutDate bed room');

export const listRefunds = async (user, { propertyId, residentId, status, ...paging }) => {
  const filter = await scopeFilter(user, propertyId, residentId, { permission: PERMISSIONS.PAYMENTS_VIEW });
  if (status) filter.status = status;
  const [items, total] = await Promise.all([
    populateRefund(Refund.find(filter).sort({ createdAt: -1 }).skip(paginate(paging).skip).limit(paging.limit)).lean(),
    Refund.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(paging, total) };
};

export const getRefund = async (user, id) => {
  const refund = await loadInScope(Refund, id, user, { label: 'Refund', permission: PERMISSIONS.PAYMENTS_VIEW });
  return populateRefund(Refund.findById(refund._id)).lean();
};

/**
 * Moves a refund between statuses atomically (the status is part of the filter, so two concurrent
 * requests cannot both succeed) and writes the audit row as the final write.
 */
const transition = async (user, id, { from, to, set, action }) => {
  const refund = await loadInScope(Refund, id, user, { label: 'Refund' });
  const updated = await runAtomic(async ({ session, onRollback }) => {
    const doc = await Refund.findOneAndUpdate({ _id: refund._id, status: from }, { $set: { status: to, ...set } }, { new: true, session });
    if (!doc) {
      const current = await Refund.findById(refund._id, { status: 1 }).lean();
      throw ApiError.conflict(`Refund is ${current.status}; expected ${from}`);
    }
    onRollback(() => Refund.updateOne({ _id: refund._id }, { $set: { status: from }, $unset: Object.fromEntries(Object.keys(set).map((k) => [k, 1])) }));
    await writeAudit(
      { user, action, entity: 'Refund', entityId: refund._id, property: refund.property, before: { status: from }, after: { status: to, ...set }, meta: { refundablePaise: refund.refundablePaise } },
      session,
    );
    return doc;
  });
  return populateRefund(Refund.findById(updated._id)).lean();
};

export const approveRefund = (user, id) =>
  transition(user, id, { from: 'pending_approval', to: 'approved', set: { approvedBy: user._id, approvedAt: new Date() }, action: 'refund.approve' });

/** The only place a refund becomes 'paid': the owner confirms the money has actually left. */
export const payRefund = (user, id, { method, reference, paidAt }) =>
  transition(user, id, { from: 'approved', to: 'paid', set: { method, ...(reference && { reference }), paidAt: paidAt ?? new Date() }, action: 'refund.pay' });

export const cancelRefund = (user, id) => transition(user, id, { from: 'pending_approval', to: 'cancelled', set: {}, action: 'refund.cancel' });
