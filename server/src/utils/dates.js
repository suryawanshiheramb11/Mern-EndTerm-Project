// Calendar rules ("today", "not in the future") follow the business timezone, not the server's.
const BUSINESS_TIMEZONE = 'Asia/Kolkata';
const DAY_MS = 24 * 60 * 60 * 1000;

// Dates are date-only values stored as UTC midnight.
export const businessToday = () =>
  new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE }).format(new Date())}T00:00:00.000Z`);

export const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

// Timestamps are bucketed by business-timezone (IST) month. Date-only values are stored as UTC
// midnight, which is 05:30 IST of the same day, so they fall inside the same IST day/month.
const IST_OFFSET_MS = 330 * 60 * 1000;

export const periodKeyOfInstant = (date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE }).format(date).slice(0, 7);

// [start, end) of a YYYY-MM period as instants.
export const periodRange = (periodKey) => {
  const [y, m] = periodKey.split('-').map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1) - IST_OFFSET_MS), end: new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS) };
};

// [from, to] are inclusive date-only values; the result is a [start, end) instant range.
export const dayRange = (from, to) => ({
  ...(from && { start: new Date(from.getTime() - IST_OFFSET_MS) }),
  ...(to && { end: new Date(to.getTime() + DAY_MS - IST_OFFSET_MS) }),
});
