import { RentCharge } from '../models/RentCharge.js';
import { addDays, businessToday } from '../utils/dates.js';
import { notify } from '../services/notification.service.js';

const REMINDER_DAYS = 3;
const OWES = { $expr: { $gt: ['$netDuePaise', '$paidPaise'] } };

/**
 * Notifies residents whose rent falls due within the next 3 days. The window (today ..
 * today + 3) rather than "exactly 3 days before" means a missed run still catches up, and the
 * notification's dedupe key (charge + due date) keeps repeat runs from re-sending.
 */
export const runRentReminders = async ({ propertyIds, today = businessToday() } = {}) => {
  const filter = { ...OWES, status: { $in: ['pending', 'partial'] }, dueDate: { $gte: today, $lte: addDays(today, REMINDER_DAYS) }, ...(propertyIds && { property: { $in: propertyIds } }) };
  const totals = { scanned: 0, created: 0, skipped: 0 };
  for await (const charge of RentCharge.find(filter).lean().cursor()) {
    const r = await notify('rent_due_soon', { charge });
    totals.scanned += 1;
    totals.created += r.created;
    totals.skipped += r.skipped;
  }

  // Overdue and still unpaid: remind weekly (the first overdue notice is sent by reconcile).
  const overdue = { ...OWES, status: 'overdue', ...(propertyIds && { property: { $in: propertyIds } }) };
  for await (const charge of RentCharge.find(overdue).lean().cursor()) {
    const week = Math.floor((today - charge.dueDate) / (7 * 86400000));
    if (week < 1) continue;
    const r = await notify('rent_overdue_reminder', { charge, week });
    totals.scanned += 1;
    totals.created += r.created;
    totals.skipped += r.skipped;
  }
  return totals;
};
