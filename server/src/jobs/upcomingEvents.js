import { Stay } from '../models/Stay.js';
import { addDays, businessToday } from '../utils/dates.js';
import { notify } from '../services/notification.service.js';

const WINDOW_DAYS = 3;

/** Tells owners/wardens about check-outs (expectedCheckOutDate) and reservations arriving within 3 days. */
export const runUpcomingEvents = async ({ propertyIds, today = businessToday() } = {}) => {
  const scope = propertyIds ? { property: { $in: propertyIds } } : {};
  const window = { $gte: today, $lte: addDays(today, WINDOW_DAYS) };
  const totals = { checkouts: 0, checkins: 0, created: 0, skipped: 0 };

  const add = (r) => {
    totals.created += r.created;
    totals.skipped += r.skipped;
  };
  for await (const stay of Stay.find({ ...scope, status: 'active', expectedCheckOutDate: window }).populate('resident', 'fullName').lean().cursor()) {
    add(await notify('checkout_upcoming', { stay: { ...stay, resident: stay.resident._id }, residentName: stay.resident.fullName }));
    totals.checkouts += 1;
  }
  for await (const stay of Stay.find({ ...scope, status: 'active', reservationTimer: { $exists: true }, checkInDate: window }).populate('resident', 'fullName').lean().cursor()) {
    add(await notify('checkin_upcoming', { stay: { ...stay, resident: stay.resident._id }, residentName: stay.resident.fullName }));
    totals.checkins += 1;
  }
  return totals;
};
