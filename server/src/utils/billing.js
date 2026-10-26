import { addDays } from './dates.js';

// Pure billing rules, kept free of I/O so they are trivial to test.

export const parsePeriodKey = (periodKey) => {
  const [year, month] = periodKey.split('-').map(Number);
  return { year, month };
};

export const periodKeyOf = (date) => date.toISOString().slice(0, 7);

export const nextPeriodKey = (periodKey) => {
  const { year, month } = parsePeriodKey(periodKey);
  return periodKeyOf(new Date(Date.UTC(year, month, 1)));
};

export const periodBounds = (periodKey) => {
  const { year, month } = parsePeriodKey(periodKey);
  return {
    periodStart: new Date(Date.UTC(year, month - 1, 1)),
    periodEnd: new Date(Date.UTC(year, month, 0)),
  };
};

// The billing day is clamped to 28 and to the length of the month, then stored as a date.
export const dueDateFor = (periodKey, billingDay) => {
  const { year, month } = parsePeriodKey(periodKey);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(billingDay, 28, daysInMonth)));
};

export const computeNetDue = ({ amountPaise, discountPaise = 0, adjustments = [] }) =>
  amountPaise - discountPaise + adjustments.reduce((sum, a) => sum + a.amountPaise, 0);

// Waived charges owe nothing, whatever their numbers say.
export const outstandingOf = ({ status, netDuePaise }, paidPaise) =>
  status === 'waived' ? 0 : Math.max(netDuePaise - paidPaise, 0);

export const isPastGrace = (dueDate, today, graceDays) => today > addDays(dueDate, graceDays);

/**
 * The one place status is decided. 'waived' is sticky; otherwise:
 * nothing owed -> paid; past due date + grace -> overdue (even if partly paid, paidPaise tells the
 * rest); some paid -> partial; else pending.
 */
export const deriveStatus = ({ status, netDuePaise, paidPaise, dueDate }, { today, graceDays }) => {
  if (status === 'waived') return 'waived';
  if (netDuePaise - paidPaise <= 0) return 'paid';
  if (isPastGrace(dueDate, today, graceDays)) return 'overdue';
  return paidPaise > 0 ? 'partial' : 'pending';
};

// FIFO order for auto-allocation: overdue charges first, then the rest; oldest due date first.
export const fifoCompare = (a, b) =>
  Number(b.overdue) - Number(a.overdue) ||
  a.charge.dueDate - b.charge.dueDate ||
  a.charge.periodKey.localeCompare(b.charge.periodKey);
