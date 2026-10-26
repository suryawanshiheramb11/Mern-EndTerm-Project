import mongoose from 'mongoose';
import { Advance } from '../models/Advance.js';
import { Payment } from '../models/Payment.js';
import { RentCharge } from '../models/RentCharge.js';
import { Stay } from '../models/Stay.js';
import { businessToday } from '../utils/dates.js';
import { outstandingOf } from '../utils/billing.js';

/** Net amount received per charge, summed from the payment ledger (reversals net themselves out). */
export const ledgerPaidByCharge = async (match) => {
  const rows = await Payment.aggregate([
    { $match: match },
    { $unwind: '$allocations' },
    { $group: { _id: '$allocations.charge', paidPaise: { $sum: '$allocations.amountPaise' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.paidPaise]));
};

/**
 * Rent balance for one resident, computed from the ledger rather than any cached field.
 * The security deposit is a liability and is reported separately (depositHeldPaise); it is never
 * part of what was due, what was paid, or what is outstanding.
 */
export const getResidentBalance = async (residentId, { today = businessToday() } = {}) => {
  const id = new mongoose.Types.ObjectId(String(residentId));
  const [charges, paid, advances, activeStay] = await Promise.all([
    RentCharge.find({ resident: id }).sort({ dueDate: 1, periodKey: 1 }).lean(),
    ledgerPaidByCharge({ resident: id }),
    Advance.find({ resident: id, reversedAt: { $exists: false } }).lean(),
    Stay.findOne({ resident: id, status: 'active' }, { depositPaise: 1 }).lean(),
  ]);

  const breakdownByCharge = charges.map((charge) => {
    const paidPaise = paid.get(String(charge._id)) ?? 0;
    return {
      chargeId: String(charge._id),
      periodKey: charge.periodKey,
      dueDate: charge.dueDate,
      status: charge.status,
      netDuePaise: charge.netDuePaise,
      paidPaise,
      outstandingPaise: outstandingOf(charge, paidPaise),
      overdue: charge.status === 'overdue',
    };
  });

  const sum = (key) => breakdownByCharge.reduce((total, row) => total + row[key], 0);
  return {
    residentId: String(id),
    asOf: today,
    totalDuePaise: sum('netDuePaise'),
    totalPaidPaise: sum('paidPaise'),
    outstandingPaise: sum('outstandingPaise'),
    overduePaise: breakdownByCharge.filter((r) => r.overdue).reduce((t, r) => t + r.outstandingPaise, 0),
    advancesPaise: advances.reduce((total, a) => total + a.amountPaise, 0),
    depositHeldPaise: activeStay?.depositPaise ?? 0,
    breakdownByCharge,
  };
};
