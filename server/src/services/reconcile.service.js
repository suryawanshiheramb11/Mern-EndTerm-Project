import { RentCharge } from '../models/RentCharge.js';
import { Property } from '../models/Property.js';
import { notify } from './notification.service.js';
import { addDays, businessToday } from '../utils/dates.js';

const OWES = { $expr: { $gt: ['$netDuePaise', '$paidPaise'] } };

/**
 * Brings charge statuses in line with the clock. For each property:
 *  - pending/partial charges that are past dueDate + gracePeriodDays and still owe money -> overdue
 *  - overdue charges that are no longer past due (e.g. the due date was moved) -> partial/pending
 * Idempotent; safe to call after every payment and from a cron. `propertyId` null = all properties.
 */
export const reconcileOverdue = async (propertyId = null, today = businessToday(), { residentId } = {}) => {
  const properties = await Property.find(propertyId ? { _id: propertyId } : {}, { settings: 1 }).lean();
  const totals = { markedOverdue: 0, reopened: 0 };

  for (const property of properties) {
    // dueDate + grace < today  <=>  dueDate < today - grace
    const cutoff = addDays(today, -(property.settings?.gracePeriodDays ?? 0));
    const scope = { property: property._id, ...(residentId && { resident: residentId }) };

    const dueNow = { ...scope, ...OWES, status: { $in: ['pending', 'partial'] }, dueDate: { $lt: cutoff } };
    const flipIds = await RentCharge.distinct('_id', dueNow);
    const flipped = await RentCharge.updateMany({ ...dueNow, _id: { $in: flipIds } }, { $set: { status: 'overdue' } });
    const backToPartial = await RentCharge.updateMany(
      { ...scope, ...OWES, status: 'overdue', dueDate: { $gte: cutoff }, paidPaise: { $gt: 0 } },
      { $set: { status: 'partial' } },
    );
    const backToPending = await RentCharge.updateMany(
      { ...scope, ...OWES, status: 'overdue', dueDate: { $gte: cutoff }, paidPaise: 0 },
      { $set: { status: 'pending' } },
    );

    // Exactly one notification per charge (deduped), only for charges this run actually flipped.
    for await (const charge of RentCharge.find({ _id: { $in: flipIds }, status: 'overdue' }).lean().cursor()) {
      await notify('rent_overdue', { charge });
    }

    totals.markedOverdue += flipped.modifiedCount;
    totals.reopened += backToPartial.modifiedCount + backToPending.modifiedCount;
  }
  return totals;
};
