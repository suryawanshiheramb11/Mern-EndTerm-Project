import mongoose from 'mongoose';
import { Bed } from '../models/Bed.js';
import { Complaint, OPEN_STATUSES } from '../models/Complaint.js';
import { Expense } from '../models/Expense.js';
import { Payment } from '../models/Payment.js';
import { Refund } from '../models/Refund.js';
import { RentCharge } from '../models/RentCharge.js';
import { Resident } from '../models/Resident.js';
import { Stay } from '../models/Stay.js';
import { addDays, businessToday, dayRange, periodKeyOfInstant, periodRange } from '../utils/dates.js';

/*
 * Every figure here comes from an aggregation pipeline; nothing is loaded into memory and summed
 * in JS except small per-resident roll-ups. All money is integer paise and never rounded;
 * percentages are rounded to 2 decimals.
 *
 * Accounting rules (also returned to the client as `definitions`):
 *  - Revenue ("charged") = sum of netDue on rent charges with that periodKey. Deposits and
 *    advances are never in it.
 *  - Collections are attributed to the charge's period, not the payment date: a February payment
 *    for January rent is January's collection. Reversals net out through negative allocations.
 *  - Deposits are liabilities, reported on their own lines; they never touch collected or cash.
 *  - Expenses are cash-based: month of paidAt, paymentStatus 'paid', voided rows excluded.
 *  - netCashPaise = collected - expenses. It is a cash position, not profit.
 */

export const DEFINITIONS = Object.freeze({
  occupancy: 'Beds by stored status (bed service). Percent = occupied / (beds - maintenance).',
  chargedPaise: 'Sum of net due on rent charges for the period (charge service). Excludes deposits and advances.',
  collectedPaise: 'Payment allocations to the period’s charges, net of reversals (payment ledger). Attributed to the charge’s period, not the payment date.',
  outstandingPaise: 'Net due minus collected on the period’s charges, per charge, floored at zero; waived charges owe nothing.',
  depositsHeldPaise: 'Liability, not revenue: deposits on active stays plus refunds approved or pending payout.',
  expensesPaise: 'Expenses with paymentStatus paid, by month of paidAt, excluding voided (cash basis).',
  netCashPaise: 'Cash position = collected - expenses. Not profit; deposits are excluded.',
  complaints: 'Unresolved complaints (complaint service); overdue = past SLA due date.',
});

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 10000) / 100 : 0);
const sumBy = async (Model, match, field) => (await Model.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: `$${field}` } } }]))[0]?.total ?? 0;
const MOVE_WINDOW_DAYS = 30;

/**
 * Per-charge ledger figures. paidPaise is summed from the payment ledger (not a cached field);
 * outstandingPaise follows the same rule as the balance service. Consumers add their own $group.
 */
export const chargeLedgerStages = (match) => [
  { $match: match },
  { $lookup: { from: 'payments', localField: '_id', foreignField: 'allocations.charge', as: 'pays' } },
  {
    $addFields: {
      paidPaise: {
        $sum: {
          $map: {
            input: '$pays',
            as: 'p',
            in: {
              $sum: {
                $map: {
                  input: { $filter: { input: '$$p.allocations', as: 'a', cond: { $eq: ['$$a.charge', '$_id'] } } },
                  as: 'x',
                  in: '$$x.amountPaise',
                },
              },
            },
          },
        },
      },
    },
  },
  {
    $addFields: {
      outstandingPaise: { $cond: [{ $eq: ['$status', 'waived'] }, 0, { $max: [{ $subtract: ['$netDuePaise', '$paidPaise'] }, 0] }] },
    },
  },
  { $project: { pays: 0 } },
];

const totals = { charged: { $sum: '$netDuePaise' }, collected: { $sum: '$paidPaise' }, outstanding: { $sum: '$outstandingPaise' } };

const periodsOverlapping = ({ from, to }) => {
  const today = businessToday();
  const lo = periodKeyOfInstant(from ?? to ?? today);
  const hi = periodKeyOfInstant(to ?? from ?? today);
  return { $gte: lo, $lte: hi };
};

/* ---------------- overview ---------------- */

export const overview = async (propertyId, periodKey = periodKeyOfInstant(new Date())) => {
  const property = oid(propertyId);
  const { start, end } = periodRange(periodKey);
  const today = businessToday();
  const soon = addDays(today, MOVE_WINDOW_DAYS);

  const [beds, rentRows, activeDeposits, refundsPayable, refundedThisPeriod, depositsReceived, expenseRows, openComplaints, overdueComplaints, priorityRows, moveInCount, moveIns, moveOutCount, moveOuts] =
    await Promise.all([
      Bed.aggregate([{ $match: { property, status: { $ne: 'inactive' } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      RentCharge.aggregate([...chargeLedgerStages({ property, periodKey }), { $group: { _id: null, ...totals } }]),
      sumBy(Stay, { property, status: 'active', reservationTimer: { $exists: false } }, 'depositPaise'),
      sumBy(Refund, { property, status: { $in: ['pending_approval', 'approved'] } }, 'refundablePaise'),
      sumBy(Refund, { property, status: 'paid', paidAt: { $gte: start, $lt: end } }, 'refundablePaise'),
      sumBy(Stay, { property, transferredFromStay: { $exists: false }, reservationTimer: { $exists: false }, checkInDate: { $gte: start, $lt: end } }, 'depositPaise'),
      Expense.aggregate([
        { $match: { property, isVoided: false, paymentStatus: 'paid', periodKey } },
        { $group: { _id: '$category', totalPaise: { $sum: '$amountPaise' } } },
        { $sort: { totalPaise: -1 } },
      ]),
      Complaint.countDocuments({ property, status: { $in: OPEN_STATUSES } }),
      Complaint.countDocuments({ property, status: { $in: OPEN_STATUSES }, slaDueAt: { $lt: new Date() } }),
      Complaint.aggregate([{ $match: { property, status: { $in: OPEN_STATUSES } } }, { $group: { _id: { $ifNull: ['$priority', 'unset'] }, n: { $sum: 1 } } }]),
      Stay.countDocuments({ property, status: 'active', reservationTimer: { $exists: true }, checkInDate: { $gte: today, $lte: soon } }),
      Stay.find({ property, status: 'active', reservationTimer: { $exists: true }, checkInDate: { $gte: today, $lte: soon } }).sort({ checkInDate: 1 }).limit(5).populate('resident', 'fullName').lean(),
      Stay.countDocuments({ property, status: 'active', expectedCheckOutDate: { $gte: today, $lte: soon } }),
      Stay.find({ property, status: 'active', expectedCheckOutDate: { $gte: today, $lte: soon } }).sort({ expectedCheckOutDate: 1 }).limit(5).populate('resident', 'fullName').lean(),
    ]);

  const byStatus = Object.fromEntries(beds.map((b) => [b._id, b.n]));
  const totalBeds = beds.reduce((sum, b) => sum + b.n, 0);
  const occupied = byStatus.occupied ?? 0;
  const maintenance = byStatus.maintenance ?? 0;

  const rent = rentRows[0] ?? { charged: 0, collected: 0, outstanding: 0 };
  const expensesTotal = expenseRows.reduce((sum, r) => sum + r.totalPaise, 0);
  const priority = { urgent: 0, high: 0, medium: 0, low: 0, unset: 0, ...Object.fromEntries(priorityRows.map((r) => [r._id, r.n])) };
  const upcoming = (rows, key) => rows.map((s) => ({ stayId: String(s._id), residentName: s.resident?.fullName, date: s[key] }));

  return {
    period: periodKey,
    occupancy: {
      totalBeds,
      occupiedBeds: occupied,
      availableBeds: byStatus.available ?? 0,
      reservedBeds: byStatus.reserved ?? 0,
      maintenanceBeds: maintenance,
      occupancyPercent: pct(occupied, totalBeds - maintenance),
    },
    rent: {
      chargedPaise: rent.charged,
      collectedPaise: rent.collected,
      outstandingPaise: rent.outstanding,
      collectionRatePercent: pct(rent.collected, rent.charged),
    },
    // Liabilities, deliberately separate from rent. received/refunded are informational only.
    deposits: {
      heldPaise: activeDeposits + refundsPayable,
      onActiveStaysPaise: activeDeposits,
      refundsPayablePaise: refundsPayable,
      receivedThisPeriodPaise: depositsReceived,
      refundedThisPeriodPaise: refundedThisPeriod,
    },
    expenses: { totalPaise: expensesTotal, byCategory: expenseRows.map((r) => ({ category: r._id, totalPaise: r.totalPaise })) },
    netCashPaise: rent.collected - expensesTotal,
    complaints: { open: openComplaints, overdue: overdueComplaints, byPriority: priority, highPriority: priority.high + priority.urgent },
    upcomingMoveIns: { count: moveInCount, windowDays: MOVE_WINDOW_DAYS, next: upcoming(moveIns, 'checkInDate') },
    upcomingMoveOuts: { count: moveOutCount, windowDays: MOVE_WINDOW_DAYS, next: upcoming(moveOuts, 'expectedCheckOutDate') },
    definitions: DEFINITIONS,
  };
};

/* ---------------- occupancy series ---------------- */

export const MAX_SERIES_DAYS = 400;

export const occupancySeries = async (propertyId, { from, to }) => {
  const property = oid(propertyId);
  const today = businessToday();
  const end = to && to < today ? to : today;
  const start = from ?? addDays(end, -29);
  const days = Math.round((end - start) / 86_400_000) + 1;
  if (days < 1) return { from: start, to: end, bedsBasis: 'current', points: [] };
  if (days > MAX_SERIES_DAYS) return { error: `Range too long (max ${MAX_SERIES_DAYS} days)` };

  const [beds, opening, ins, outs] = await Promise.all([
    Bed.aggregate([{ $match: { property, status: { $ne: 'inactive' } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Stay.countDocuments({ property, checkInDate: { $lte: start }, $or: [{ actualCheckOutDate: { $exists: false } }, { actualCheckOutDate: { $gt: start } }] }),
    Stay.aggregate([{ $match: { property, checkInDate: { $gt: start, $lte: end } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$checkInDate' } }, n: { $sum: 1 } } }]),
    Stay.aggregate([{ $match: { property, actualCheckOutDate: { $gt: start, $lte: end } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$actualCheckOutDate' } }, n: { $sum: 1 } } }]),
  ]);

  const totalBeds = beds.reduce((s, b) => s + b.n, 0);
  const maintenance = beds.find((b) => b._id === 'maintenance')?.n ?? 0;
  const inBy = new Map(ins.map((r) => [r._id, r.n]));
  const outBy = new Map(outs.map((r) => [r._id, r.n]));

  let occupied = opening;
  const points = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDays(start, i);
    const key = date.toISOString().slice(0, 10);
    if (i > 0) occupied += (inBy.get(key) ?? 0) - (outBy.get(key) ?? 0);
    points.push({ date: key, occupiedBeds: occupied, totalBeds, occupancyPercent: pct(occupied, totalBeds - maintenance) });
  }
  // Bed totals are today's (beds keep no history), so older points approximate the denominator.
  return { from: start, to: end, bedsBasis: 'current', points };
};

/* ---------------- collections / outstanding / trend / expenses ---------------- */

const withResident = [
  { $lookup: { from: 'residents', localField: '_id', foreignField: '_id', as: 'r' } },
  { $unwind: { path: '$r', preserveNullAndEmptyArrays: true } },
];

export const collections = async (propertyId, range) => {
  const property = oid(propertyId);
  const periodKey = periodsOverlapping(range);
  const rows = await RentCharge.aggregate([
    ...chargeLedgerStages({ property, periodKey }),
    { $group: { _id: '$resident', ...totals, charges: { $sum: 1 } } },
    ...withResident,
    { $project: { _id: 0, residentId: '$_id', fullName: '$r.fullName', chargedPaise: '$charged', paidPaise: '$collected', outstandingPaise: '$outstanding', charges: 1 } },
    { $sort: { outstandingPaise: -1, fullName: 1 } },
  ]);
  const sum = (key) => rows.reduce((t, r) => t + r[key], 0);
  return {
    fromPeriod: periodKey.$gte,
    toPeriod: periodKey.$lte,
    totals: { chargedPaise: sum('chargedPaise'), paidPaise: sum('paidPaise'), outstandingPaise: sum('outstandingPaise') },
    items: rows,
  };
};

export const AGING_BUCKETS = ['0-15', '16-30', '31-60', '60+'];

export const outstanding = async (propertyId, today = businessToday()) => {
  const property = oid(propertyId);
  const ageDays = { $floor: { $divide: [{ $subtract: [today, '$dueDate'] }, 86_400_000] } };
  // Charges not yet due count as current (0-15).
  const bucket = { $switch: { branches: [{ case: { $lte: [ageDays, 15] }, then: '0-15' }, { case: { $lte: [ageDays, 30] }, then: '16-30' }, { case: { $lte: [ageDays, 60] }, then: '31-60' }], default: '60+' } };
  const inBucket = (name) => ({ $sum: { $cond: [{ $eq: ['$bucket', name] }, '$outstandingPaise', 0] } });

  const rows = await RentCharge.aggregate([
    ...chargeLedgerStages({ property, status: { $ne: 'waived' } }),
    { $match: { outstandingPaise: { $gt: 0 } } },
    { $addFields: { bucket } },
    { $group: { _id: '$resident', outstandingPaise: { $sum: '$outstandingPaise' }, b1: inBucket('0-15'), b2: inBucket('16-30'), b3: inBucket('31-60'), b4: inBucket('60+'), oldestDueDate: { $min: '$dueDate' }, charges: { $sum: 1 } } },
    ...withResident,
    {
      $project: {
        _id: 0, residentId: '$_id', fullName: '$r.fullName', phone: '$r.phone', outstandingPaise: 1, oldestDueDate: 1, charges: 1,
        aging: { '0-15': '$b1', '16-30': '$b2', '31-60': '$b3', '60+': '$b4' },
      },
    },
    { $sort: { outstandingPaise: -1, fullName: 1 } },
  ]);
  const aging = Object.fromEntries(AGING_BUCKETS.map((b) => [b, rows.reduce((t, r) => t + r.aging[b], 0)]));
  return { asOf: today, totalOutstandingPaise: rows.reduce((t, r) => t + r.outstandingPaise, 0), aging, items: rows };
};

export const trend = async (propertyId, months, now = new Date()) => {
  const property = oid(propertyId);
  const keys = [];
  let key = periodKeyOfInstant(now);
  for (let i = 0; i < months; i += 1) {
    keys.unshift(key);
    const [y, m] = key.split('-').map(Number);
    key = periodKeyOfInstant(new Date(Date.UTC(y, m - 2, 15)));
  }
  const [rentRows, expenseRows] = await Promise.all([
    RentCharge.aggregate([...chargeLedgerStages({ property, periodKey: { $in: keys } }), { $group: { _id: '$periodKey', ...totals } }]),
    Expense.aggregate([{ $match: { property, isVoided: false, paymentStatus: 'paid', periodKey: { $in: keys } } }, { $group: { _id: '$periodKey', totalPaise: { $sum: '$amountPaise' } } }]),
  ]);
  const rent = new Map(rentRows.map((r) => [r._id, r]));
  const exp = new Map(expenseRows.map((r) => [r._id, r.totalPaise]));
  return {
    months: keys.map((periodKey) => {
      const r = rent.get(periodKey);
      const expensesPaise = exp.get(periodKey) ?? 0;
      return { periodKey, chargedPaise: r?.charged ?? 0, collectedPaise: r?.collected ?? 0, outstandingPaise: r?.outstanding ?? 0, expensesPaise, netCashPaise: (r?.collected ?? 0) - expensesPaise };
    }),
  };
};

export const expensesReport = async (propertyId, { from, to, groupBy = 'category' }) => {
  const property = oid(propertyId);
  const today = businessToday();
  const range = dayRange(from ?? addDays(today, -180), to ?? today);
  const rows = await Expense.aggregate([
    { $match: { property, isVoided: false, paymentStatus: 'paid', paidAt: { $gte: range.start, $lt: range.end } } },
    { $group: { _id: groupBy === 'month' ? '$periodKey' : '$category', totalPaise: { $sum: '$amountPaise' }, count: { $sum: 1 } } },
    { $sort: groupBy === 'month' ? { _id: 1 } : { totalPaise: -1 } },
  ]);
  return { groupBy, from: range.start, to: range.end, totalPaise: rows.reduce((t, r) => t + r.totalPaise, 0), items: rows.map((r) => ({ key: r._id, totalPaise: r.totalPaise, count: r.count })) };
};

/* ---------------- CSV export ---------------- */

const nameLookup = (field, as) => [
  { $lookup: { from: 'residents', localField: field, foreignField: '_id', as } },
  { $unwind: { path: `$${as}`, preserveNullAndEmptyArrays: true } },
];

/** Returns { headers, filename, cursor, toRow } so the controller can stream rows without buffering. */
export const exportSpec = (type, propertyId, { from, to }) => {
  const property = oid(propertyId);
  const stamp = businessToday().toISOString().slice(0, 10);
  const { start, end } = dayRange(from, to);
  const instantRange = (field) => (start || end ? { [field]: { ...(start && { $gte: start }), ...(end && { $lt: end }) } } : {});
  const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

  if (type === 'charges') {
    return {
      filename: `stayos-charges-${stamp}.csv`,
      headers: ['periodKey', 'resident', 'dueDate', 'status', 'amountPaise', 'discountPaise', 'netDuePaise', 'paidPaise', 'outstandingPaise'],
      cursor: () =>
        RentCharge.aggregate([
          ...chargeLedgerStages({ property, ...(from || to ? { periodKey: periodsOverlapping({ from, to }) } : {}) }),
          ...nameLookup('resident', 'r'),
          { $sort: { periodKey: 1, dueDate: 1 } },
        ]).cursor(),
      toRow: (c) => [c.periodKey, c.r?.fullName, iso(c.dueDate), c.status, c.amountPaise, c.discountPaise, c.netDuePaise, c.paidPaise, c.outstandingPaise],
    };
  }
  if (type === 'payments') {
    return {
      filename: `stayos-payments-${stamp}.csv`,
      headers: ['receiptNumber', 'paidAt', 'resident', 'method', 'reference', 'status', 'isReversal', 'amountPaise', 'advancePaise'],
      cursor: () =>
        Payment.aggregate([{ $match: { property, ...instantRange('paidAt') } }, ...nameLookup('resident', 'r'), { $sort: { paidAt: 1, receiptNumber: 1 } }]).cursor(),
      toRow: (p) => [p.receiptNumber, iso(p.paidAt), p.r?.fullName, p.method, p.reference, p.status, Boolean(p.reversalOf), p.amountPaise, p.advancePaise ?? 0],
    };
  }
  if (type === 'expenses') {
    return {
      filename: `stayos-expenses-${stamp}.csv`,
      headers: ['paidAt', 'periodKey', 'category', 'paymentStatus', 'vendor', 'description', 'receiptUrl', 'amountPaise'],
      cursor: () => Expense.aggregate([{ $match: { property, isVoided: false, ...instantRange('paidAt') } }, { $sort: { paidAt: 1 } }]).cursor(),
      toRow: (e) => [iso(e.paidAt), e.periodKey, e.category, e.paymentStatus, e.vendor, e.description, e.receiptUrl, e.amountPaise],
    };
  }
  return {
    filename: `stayos-residents-${stamp}.csv`,
    headers: ['fullName', 'phone', 'email', 'status', 'room', 'bed', 'checkInDate', 'monthlyRentPaise', 'depositPaise'],
    cursor: () =>
      Resident.aggregate([
        { $match: { property } },
        { $lookup: { from: 'stays', let: { id: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$resident', '$$id'] }, { $eq: ['$status', 'active'] }] } } }], as: 's' } },
        { $unwind: { path: '$s', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'rooms', localField: 's.room', foreignField: '_id', as: 'room' } },
        { $lookup: { from: 'beds', localField: 's.bed', foreignField: '_id', as: 'bed' } },
        { $sort: { fullName: 1 } },
      ]).cursor(),
    toRow: (r) => [r.fullName, r.phone, r.email, r.status, r.room?.[0]?.number, r.bed?.[0]?.label, iso(r.s?.checkInDate), r.s?.monthlyRentPaise, r.s?.depositPaise],
  };
};
