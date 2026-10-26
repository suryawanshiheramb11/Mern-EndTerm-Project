import { Bed } from '../models/Bed.js';
import { Payment } from '../models/Payment.js';
import { Refund } from '../models/Refund.js';
import { RentCharge } from '../models/RentCharge.js';
import { Resident } from '../models/Resident.js';
import { Room } from '../models/Room.js';
import { Stay } from '../models/Stay.js';
import { PERMISSIONS } from '../config/permissions.js';
import { runAtomic } from '../config/transactions.js';
import { ApiError } from '../utils/ApiError.js';
import { businessToday } from '../utils/dates.js';
import { writeAudit } from './audit.service.js';
import { notify } from './notification.service.js';
import { getResidentBalance } from './balance.service.js';
import { loadInScope } from './scope.js';

const WRITE = PERMISSIONS.STAYS_WRITE;

const fieldError = (field, message) => ApiError.badRequest('Validation failed', [{ field, message }]);
const inr = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/*
 * Check-out math lives here and only here; the client displays what this returns.
 *
 *   refundable = deposit - documented deductions - outstanding rent netted against the deposit
 *
 * Outstanding rent comes from the payment ledger (balance service), never from the request. Charges
 * for periods that start after the check-out date and were never touched by a payment are waived
 * on commit (not deleted) and are excluded from "outstanding".
 */
export const buildPlan = async (stay, input, { today = businessToday() } = {}) => {
  const { actualCheckOutDate, deductions = [], deductOutstandingRent = true } = input;
  if (actualCheckOutDate < stay.checkInDate) throw fieldError('actualCheckOutDate', 'Cannot be before the check-in date');
  if (actualCheckOutDate > today) throw fieldError('actualCheckOutDate', 'Cannot be in the future');

  const deposit = stay.depositPaise;
  const deductionsTotalPaise = deductions.reduce((sum, d) => sum + d.amountPaise, 0);
  if (deductionsTotalPaise > deposit) {
    throw fieldError('deductions', `Deductions (${inr(deductionsTotalPaise)}) exceed the deposit (${inr(deposit)})`);
  }

  const [balance, charges, touched, bed, reversedCount, unverifiedCount] = await Promise.all([
    getResidentBalance(stay.resident, { today }),
    RentCharge.find({ resident: stay.resident }).lean(),
    Payment.distinct('allocations.charge', { resident: stay.resident }),
    Bed.findById(stay.bed, { status: 1, label: 1 }).lean(),
    Payment.countDocuments({ resident: stay.resident, status: 'reversed', reversalOf: { $exists: false } }),
    Payment.countDocuments({ resident: stay.resident, status: 'recorded', reversalOf: { $exists: false } }),
  ]);

  const touchedIds = new Set(touched.map(String));
  const byId = new Map(charges.map((c) => [String(c._id), c]));
  const toWaive = charges.filter(
    (c) => String(c.stay) === String(stay._id) && c.status === 'pending' && c.periodStart > actualCheckOutDate && !touchedIds.has(String(c._id)),
  );
  const waiveIds = new Set(toWaive.map((c) => String(c._id)));

  const rows = balance.breakdownByCharge.map((row) => ({
    ...row,
    toBeWaived: waiveIds.has(row.chargeId),
    stay: String(byId.get(row.chargeId)?.stay),
  }));
  const live = rows.filter((r) => !r.toBeWaived);
  const sum = (key) => live.reduce((total, r) => total + r[key], 0);
  const outstandingRentPaise = sum('outstandingPaise');

  const rentDeductedPaise = deductOutstandingRent ? Math.min(outstandingRentPaise, deposit - deductionsTotalPaise) : 0;
  const refundablePaise = deposit - deductionsTotalPaise - rentDeductedPaise;
  const unrecoveredRentPaise = outstandingRentPaise - rentDeductedPaise;

  const warnings = [];
  const blockingIssues = [];
  if (outstandingRentPaise > 0 && !deductOutstandingRent) {
    blockingIssues.push(`Outstanding rent of ${inr(outstandingRentPaise)} is unpaid and is not being deducted from the deposit`);
  }
  if (deductOutstandingRent && unrecoveredRentPaise > 0) {
    warnings.push(`Outstanding rent exceeds the deposit; ${inr(unrecoveredRentPaise)} remains unpaid after deduction`);
  }
  if (deposit === 0) warnings.push('No deposit was held for this stay');
  if (refundablePaise === 0 && deposit > 0) warnings.push('Nothing is refundable after deductions');
  for (const d of deductions.filter((x) => !x.evidenceRef)) warnings.push(`Deduction "${d.reason}" has no evidence reference`);
  if (reversedCount) warnings.push(`Resident had ${plural(reversedCount, 'reversed payment')}`);
  if (unverifiedCount) warnings.push(`${plural(unverifiedCount, 'payment')} not yet verified by the owner`);
  if (balance.advancesPaise > 0) warnings.push(`Resident holds an unapplied advance of ${inr(balance.advancesPaise)}, which is not part of this refund`);
  if (toWaive.length) warnings.push(`${plural(toWaive.length, 'future unpaid charge')} will be waived`);
  if (bed && bed.status !== 'occupied') warnings.push(`Bed is ${bed.status} and will not be released`);

  return {
    deposit,
    deductionsTotalPaise,
    outstandingRentPaise,
    rentDeductedPaise,
    refundablePaise,
    unrecoveredRentPaise,
    toWaive,
    warnings,
    blockingIssues,
    rentSummary: {
      charges: rows,
      totalChargedPaise: sum('netDuePaise'),
      totalPaidPaise: sum('paidPaise'),
      outstandingRentPaise,
    },
  };
};

const loadActiveStay = async (user, stayId, permission = WRITE) => {
  const stay = await loadInScope(Stay, stayId, user, { label: 'Stay', permission });
  if (stay.status !== 'active') throw ApiError.conflict('Stay has already ended');
  if (stay.reservationTimer) throw ApiError.conflict('A reservation cannot be checked out; it has not started');
  return stay;
};

export const previewCheckout = async (user, stayId, input) => {
  const stay = await loadActiveStay(user, stayId);
  const plan = await buildPlan(stay, input);
  const [resident, bed, room] = await Promise.all([
    Resident.findById(stay.resident, { fullName: 1, phone: 1 }).lean(),
    Bed.findById(stay.bed, { label: 1, status: 1 }).lean(),
    Room.findById(stay.room, { number: 1, floor: 1 }).lean(),
  ]);
  return {
    staySummary: {
      stayId: String(stay._id),
      resident: { id: String(resident._id), fullName: resident.fullName },
      bed: { id: String(bed._id), label: bed.label, status: bed.status },
      room: { id: String(room._id), number: room.number },
      checkInDate: stay.checkInDate,
      actualCheckOutDate: input.actualCheckOutDate,
    },
    rentSummary: plan.rentSummary,
    deposit: {
      originalDepositPaise: plan.deposit,
      deductionsTotalPaise: plan.deductionsTotalPaise,
      outstandingRentDeductedPaise: plan.rentDeductedPaise,
      refundablePaise: plan.refundablePaise,
    },
    warnings: plan.warnings,
    blockingIssues: plan.blockingIssues,
  };
};

/** Undoes waiveFutureCharge when a later step of the check-out fails (non-transactional mode). */
const waiveFutureCharge = async (charge, user, { session, onRollback }) => {
  const waived = await RentCharge.findOneAndUpdate(
    { _id: charge._id, status: 'pending', paidPaise: 0 },
    {
      $inc: { netDuePaise: -charge.netDuePaise },
      $set: { status: 'waived' },
      $push: { adjustments: { amountPaise: -charge.netDuePaise, reason: 'checkout', kind: 'waiver', createdBy: user._id, createdAt: new Date() } },
    },
    { new: true, session },
  );
  if (!waived) return null; // paid or changed meanwhile: leave it alone
  onRollback(() =>
    RentCharge.updateOne(
      { _id: charge._id },
      { $inc: { netDuePaise: charge.netDuePaise }, $set: { status: 'pending' }, $pull: { adjustments: { reason: 'checkout', kind: 'waiver' } } },
    ),
  );
  return waived;
};

export const commitCheckout = async (user, stayId, input) => {
  const { force = false, forceReason, approveRefundNow = false, notes } = input;
  if (force && user.role !== 'owner') throw ApiError.forbidden('Only an owner can override blocking issues');
  if (approveRefundNow && user.role !== 'owner') throw ApiError.forbidden('Only an owner can approve a refund');
  if (force && !forceReason) throw fieldError('forceReason', 'A reason is required to override blocking issues');

  const stay = await loadActiveStay(user, stayId);
  const plan = await buildPlan(stay, input);
  if (plan.blockingIssues.length && !force) {
    throw ApiError.conflict('Check-out is blocked', plan.blockingIssues.map((message) => ({ field: 'blockingIssues', message })));
  }

  const now = new Date();
  const deductions = [
    ...(input.deductions ?? []),
    ...(plan.rentDeductedPaise > 0 ? [{ amountPaise: plan.rentDeductedPaise, reason: 'outstanding rent', system: true }] : []),
  ];
  const warnings = [...plan.warnings];

  const result = await runAtomic(async (ctx) => {
    const { session, onRollback } = ctx;

    // 1. The gate: only one concurrent request can flip an active stay to ended.
    const ended = await Stay.findOneAndUpdate(
      { _id: stay._id, status: 'active' },
      {
        $set: {
          status: 'ended',
          endedReason: 'checkout',
          actualCheckOutDate: input.actualCheckOutDate,
          checkoutRequestedAt: now,
          checkoutRequestedBy: user._id,
          finalDuesSnapshotPaise: plan.outstandingRentPaise,
          depositSnapshotPaise: plan.deposit,
        },
      },
      { new: true, session },
    );
    if (!ended) throw ApiError.conflict('Stay has already ended');
    onRollback(() =>
      Stay.updateOne(
        { _id: stay._id },
        { $set: { status: 'active' }, $unset: { endedReason: 1, actualCheckOutDate: 1, checkoutRequestedAt: 1, checkoutRequestedBy: 1, finalDuesSnapshotPaise: 1, depositSnapshotPaise: 1 } },
      ),
    );

    // 2. Waive (never delete) untouched future charges.
    const waivedIds = [];
    for (const charge of plan.toWaive) {
      if (await waiveFutureCharge(charge, user, ctx)) waivedIds.push(String(charge._id));
    }

    // 3. The refund row (one per stay, enforced by the unique index), even when the amount is 0.
    let refund;
    try {
      [refund] = await Refund.create(
        [
          {
            property: stay.property,
            resident: stay.resident,
            stay: stay._id,
            originalDepositPaise: plan.deposit,
            deductions,
            totalDeductionsPaise: plan.deductionsTotalPaise + plan.rentDeductedPaise,
            outstandingRentPaise: plan.outstandingRentPaise,
            outstandingRentDeductedPaise: plan.rentDeductedPaise,
            refundablePaise: plan.refundablePaise,
            status: approveRefundNow ? 'approved' : 'pending_approval',
            ...(approveRefundNow && { approvedBy: user._id, approvedAt: now }),
            notes,
            createdBy: user._id,
          },
        ],
        { session },
      );
    } catch (err) {
      if (err?.code === 11000) throw ApiError.conflict('A refund already exists for this stay');
      throw err;
    }
    onRollback(() => Refund.collection.deleteOne({ _id: refund._id }));

    // 4. Free the bed only if it is still 'occupied'; reserved or maintenance beds are left alone.
    const freed = await Bed.findOneAndUpdate({ _id: stay.bed, status: 'occupied' }, { $set: { status: 'available' } }, { new: true, session });
    if (freed) onRollback(() => Bed.updateOne({ _id: stay.bed, status: 'available' }, { $set: { status: 'occupied' } }));

    // 5. The resident becomes 'former' unless they still have an active stay elsewhere.
    const stillActive = await Stay.exists({ resident: stay.resident, status: 'active' }).session(session ?? null);
    if (!stillActive) {
      const flipped = await Resident.updateOne({ _id: stay.resident, status: 'active' }, { $set: { status: 'former' } }, { session });
      if (flipped.modifiedCount) onRollback(() => Resident.updateOne({ _id: stay.resident }, { $set: { status: 'active' } }));
    }

    // 6. Audit rows are the final writes, so they never need rolling back.
    const meta = {
      refundId: String(refund._id),
      refundablePaise: plan.refundablePaise,
      outstandingRentPaise: plan.outstandingRentPaise,
      rentDeductedPaise: plan.rentDeductedPaise,
      waivedChargeIds: waivedIds,
      warnings,
      ...(plan.blockingIssues.length && { blockingIssues: plan.blockingIssues, forced: force, forceReason }),
    };
    await writeAudit(
      {
        user,
        action: 'stay.checkout',
        entity: 'Stay',
        entityId: stay._id,
        property: stay.property,
        before: { status: 'active', bedStatus: 'occupied' },
        after: { status: 'ended', actualCheckOutDate: input.actualCheckOutDate, bedStatus: freed ? 'available' : 'unchanged' },
        meta,
      },
      session,
    );
    if (approveRefundNow) {
      await writeAudit(
        { user, action: 'refund.approve', entity: 'Refund', entityId: refund._id, property: stay.property, before: { status: 'pending_approval' }, after: { status: 'approved' }, meta: { viaCheckout: true } },
        session,
      );
    }
    return { stay: ended, refund, freed };
  });

  if (result.refund.status === 'pending_approval') await notify('refund_pending', { refund: result.refund });
  const bed = await Bed.findById(stay.bed).lean();
  if (!result.freed && bed.status !== 'available') warnings.push(`Bed remains ${bed.status}`);
  return {
    stay: result.stay.toObject(),
    refund: result.refund.toObject(),
    freedBed: result.freed ? bed : null,
    warnings: [...new Set(warnings)],
  };
};
