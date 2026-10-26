import { Property } from '../models/Property.js';
import { businessToday } from '../utils/dates.js';
import { reconcileOverdue } from '../services/reconcile.service.js';

/** Marks charges overdue (which also sends the overdue notifications). `propertyIds` limits scope. */
export const runOverdueReconcile = async ({ propertyIds, today = businessToday() } = {}) => {
  const ids = propertyIds ?? (await Property.find({ isActive: true }).distinct('_id'));
  const totals = { markedOverdue: 0, reopened: 0 };
  for (const id of ids) {
    const r = await reconcileOverdue(id, today);
    totals.markedOverdue += r.markedOverdue;
    totals.reopened += r.reopened;
  }
  return totals;
};
