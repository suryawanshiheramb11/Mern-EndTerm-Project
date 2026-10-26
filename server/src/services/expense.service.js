import { Expense } from '../models/Expense.js';
import { PERMISSIONS } from '../config/permissions.js';
import { ApiError } from '../utils/ApiError.js';
import { businessToday, dayRange, periodKeyOfInstant } from '../utils/dates.js';
import { pageMeta, paginate } from '../utils/pagination.js';
import { writeAudit } from './audit.service.js';
import { assertPropertyAccess, getUserPropertyIds } from './propertyAccess.service.js';
import { loadInScope } from './scope.js';

const snapshot = (e) => ({ category: e.category, amountPaise: e.amountPaise, paidAt: e.paidAt, paymentStatus: e.paymentStatus, isVoided: e.isVoided });

export const createExpense = async (user, { propertyId, ...input }) => {
  await assertPropertyAccess(user, propertyId, { permission: PERMISSIONS.FINANCES_EDIT });
  const expense = await Expense.create({ ...input, property: propertyId, periodKey: periodKeyOfInstant(input.paidAt), createdBy: user._id });
  await writeAudit({ user, action: 'expense.create', entity: 'Expense', entityId: expense._id, property: expense.property, after: snapshot(expense) });
  return expense.toObject();
};

export const listExpenses = async (user, { propertyId, category, paymentStatus, from, to, includeVoided, ...paging }) => {
  const permission = PERMISSIONS.FINANCES_VIEW;
  let property;
  if (propertyId) {
    await assertPropertyAccess(user, propertyId, { permission });
    property = propertyId;
  } else {
    property = { $in: await getUserPropertyIds(user, { permission }) };
  }
  const filter = { property };
  if (!includeVoided) filter.isVoided = false;
  if (category) filter.category = category;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  const { start, end } = dayRange(from, to);
  if (start || end) filter.paidAt = { ...(start && { $gte: start }), ...(end && { $lt: end }) };

  const [items, total] = await Promise.all([
    Expense.find(filter).sort({ paidAt: -1, createdAt: -1 }).skip(paginate(paging).skip).limit(paging.limit).lean(),
    Expense.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(paging, total) };
};

export const getExpense = async (user, id) =>
  (await loadInScope(Expense, id, user, { label: 'Expense', permission: PERMISSIONS.FINANCES_VIEW })).toObject();

export const updateExpense = async (user, id, patch) => {
  const expense = await loadInScope(Expense, id, user, { label: 'Expense', permission: PERMISSIONS.FINANCES_EDIT });
  if (expense.isVoided) throw ApiError.conflict('A voided expense cannot be edited');

  const next = { ...patch };
  const paidAt = patch.paidAt ?? expense.paidAt;
  const status = patch.paymentStatus ?? expense.paymentStatus;
  if (status === 'paid' && paidAt > businessToday()) {
    throw ApiError.badRequest('Validation failed', [{ field: 'paidAt', message: 'A paid expense cannot be dated in the future' }]);
  }
  if (patch.paidAt) next.periodKey = periodKeyOfInstant(patch.paidAt);

  const before = snapshot(expense);
  const updated = await Expense.findOneAndUpdate({ _id: expense._id, isVoided: false }, { $set: next }, { new: true, runValidators: true }).lean();
  if (!updated) throw ApiError.conflict('A voided expense cannot be edited');
  await writeAudit({ user, action: 'expense.update', entity: 'Expense', entityId: expense._id, property: expense.property, before, after: snapshot(updated) });
  return updated;
};

/** "Delete" voids the expense: it stays on record but drops out of lists and every report. */
export const voidExpense = async (user, id, { reason } = {}) => {
  const expense = await loadInScope(Expense, id, user, { label: 'Expense' });
  const voided = await Expense.findOneAndUpdate(
    { _id: expense._id, isVoided: false },
    { $set: { isVoided: true, voidedAt: new Date(), voidedBy: user._id, ...(reason && { voidReason: reason }) } },
    { new: true },
  ).lean();
  if (!voided) throw ApiError.conflict('Expense is already voided');
  await writeAudit({ user, action: 'expense.void', entity: 'Expense', entityId: expense._id, property: expense.property, before: snapshot(expense), after: snapshot(voided), meta: { reason } });
  return voided;
};
