import mongoose from 'mongoose';
import { Advance } from '../models/Advance.js';
import { Payment } from '../models/Payment.js';
import { Property } from '../models/Property.js';
import { RentCharge } from '../models/RentCharge.js';
import { Resident } from '../models/Resident.js';
import { PERMISSIONS } from '../config/permissions.js';
import { runAtomic } from '../config/transactions.js';
import { ApiError } from '../utils/ApiError.js';
import { addDays, businessToday } from '../utils/dates.js';
import { fifoCompare, isPastGrace, outstandingOf } from '../utils/billing.js';
import { isPaise } from '../utils/money.js';
import { pageMeta, paginate } from '../utils/pagination.js';
import { graceDaysFor, refreshChargeStatus } from './charge.service.js';
import { nextSeq } from './counter.service.js';
import { getResidentBalance } from './balance.service.js';
import { reconcileOverdue } from './reconcile.service.js';
import { assertPropertyAccess } from './propertyAccess.service.js';
import { loadInScope, scopeFilter } from './scope.js';
import { writeAudit } from './audit.service.js';
import { notify } from './notification.service.js';

const WRITE = PERMISSIONS.PAYMENTS_RECORD;
const MAX_AUTO_RETRIES = 3;

const fieldError = (field, message) => ApiError.badRequest('Validation failed', [{ field, message }]);

// A guarded increment lost a race with another payment/adjustment; auto-allocation re-plans.
class StaleChargeError extends ApiError {
  constructor() {
    super(409, 'A charge changed while recording the payment; please retry');
    this.stale = true;
  }
}
// Thrown inside the atomic block when our idempotency key was inserted by a concurrent request.
class DuplicateKeyError extends Error {}

// Stored namespaced by property so one tenant's keys can never collide with, or read, another's.
const namespacedKey = (propertyId, key) => (key ? `${propertyId}:${key}` : undefined);

/**
 * Ensures the property has the short code used in receipt numbers. Derived from the name plus the
 * tail of the id (stable and effectively collision-free); the unique index is the backstop.
 */
export const ensurePropertyCode = async (property) => {
  if (property.code) return property.code;
  const letters = property.name.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 3).padEnd(3, 'X');
  const code = `${letters}${String(property._id).slice(-4).toUpperCase()}`;
  await Property.updateOne({ _id: property._id, code: { $exists: false } }, { $set: { code } });
  return (await Property.findById(property._id, { code: 1 }).lean()).code;
};

const receiptNumberFor = async (property, session) => {
  const code = await ensurePropertyCode(property);
  const [year, month] = businessToday().toISOString().slice(0, 7).split('-');
  const seq = await nextSeq(`receipt:${code}-${year}-${month}`, session);
  return `${code}-${year}${month}-${String(seq).padStart(4, '0')}`;
};

/* ---------------- planning ---------------- */

const candidatesFor = async ({ propertyId, residentId, today, graceDays }) => {
  const charges = await RentCharge.find({
    property: propertyId,
    resident: residentId,
    status: { $in: ['pending', 'partial', 'overdue'] },
  }).lean();
  return charges
    .map((charge) => ({
      charge,
      overdue: isPastGrace(charge.dueDate, today, graceDays),
      outstanding: outstandingOf(charge, charge.paidPaise),
    }))
    .filter((c) => c.outstanding > 0)
    .sort(fifoCompare);
};

/**
 * Decides how a payment is split across charges, without writing anything.
 * Returns { lines: [{ charge, amountPaise }], advancePaise }.
 */
export const planAllocations = async ({ propertyId, residentId, amountPaise, allocations, allowAdvance, today, graceDays }) => {
  if (allocations?.length) {
    const ids = allocations.map((a) => String(a.chargeId));
    if (new Set(ids).size !== ids.length) throw fieldError('allocations', 'A charge can appear only once');
    const charges = await RentCharge.find({ _id: { $in: ids }, property: propertyId, resident: residentId }).lean();
    if (charges.length !== ids.length) {
      throw fieldError('allocations', 'Allocations must reference charges belonging to this resident');
    }
    const byId = new Map(charges.map((c) => [String(c._id), c]));
    const lines = allocations.map((a) => {
      const charge = byId.get(String(a.chargeId));
      if (charge.status === 'waived') throw fieldError('allocations', `Charge ${charge.periodKey} is waived`);
      const owed = outstandingOf(charge, charge.paidPaise);
      if (a.amountPaise > owed) {
        throw fieldError('allocations', `Allocation for ${charge.periodKey} exceeds the outstanding ${owed} paise`);
      }
      return { charge, amountPaise: a.amountPaise };
    });

    const allocated = lines.reduce((sum, l) => sum + l.amountPaise, 0);
    if (allocated > amountPaise) throw fieldError('allocations', 'Allocations exceed the payment amount');
    if (allocated < amountPaise && !allowAdvance) {
      throw fieldError('allocations', 'Allocations must add up to the payment amount');
    }
    return { lines, advancePaise: amountPaise - allocated };
  }

  const lines = [];
  let remaining = amountPaise;
  for (const { charge, outstanding } of await candidatesFor({ propertyId, residentId, today, graceDays })) {
    if (remaining === 0) break;
    const take = Math.min(remaining, outstanding);
    lines.push({ charge, amountPaise: take });
    remaining -= take;
  }
  if (remaining > 0 && !allowAdvance) {
    throw fieldError('amountPaise', `Payment exceeds the outstanding balance by ${remaining} paise`);
  }
  return { lines, advancePaise: remaining };
};

/* ---------------- recording ---------------- */

const findByKey = (key) => Payment.findOne({ idempotencyKey: key }).lean();

const assertSameRequest = (existing, { residentId, amountPaise }) => {
  if (String(existing.resident) !== String(residentId) || existing.amountPaise !== amountPaise) {
    throw ApiError.conflict('Idempotency key was already used for a different payment');
  }
};

const attemptRecord = async (input, { property, today, graceDays, key }) => {
  const { propertyId, residentId, amountPaise, method, reference, paidAt, notes, allocations, allowAdvance, receivedBy } = input;
  const plan = await planAllocations({ propertyId, residentId, amountPaise, allocations, allowAdvance, today, graceDays });
  const paymentId = new mongoose.Types.ObjectId();

  return runAtomic(async ({ session, onRollback }) => {
    // 1. Take the money off the charges. Each increment is conditional so concurrent payments
    //    can never allocate more than a charge is owed.
    for (const line of plan.lines) {
      const claimed = await RentCharge.findOneAndUpdate(
        {
          _id: line.charge._id,
          status: { $ne: 'waived' },
          $expr: { $lte: [{ $add: ['$paidPaise', line.amountPaise] }, '$netDuePaise'] },
        },
        { $inc: { paidPaise: line.amountPaise } },
        { new: true, session },
      );
      if (!claimed) throw new StaleChargeError();
      onRollback(() => RentCharge.updateOne({ _id: line.charge._id }, { $inc: { paidPaise: -line.amountPaise } }));
    }

    // 2. Advance record, if any. Written before the payment so the payment is the final write
    //    (a payment is never deleted, not even to undo a failed attempt).
    if (plan.advancePaise > 0) {
      await Advance.create(
        [{ property: propertyId, resident: residentId, payment: paymentId, amountPaise: plan.advancePaise }],
        { session },
      );
      onRollback(() => Advance.deleteOne({ payment: paymentId }));
    }

    // 3. The payment. The receipt number is drawn last to keep gaps rare.
    const receiptNumber = await receiptNumberFor(property, session);
    try {
      const [created] = await Payment.create(
        [
          {
            _id: paymentId,
            property: propertyId,
            resident: residentId,
            allocations: plan.lines.map((l) => ({ charge: l.charge._id, amountPaise: l.amountPaise })),
            advancePaise: plan.advancePaise,
            amountPaise,
            method,
            reference,
            paidAt,
            notes,
            receivedBy,
            receiptNumber,
            idempotencyKey: key,
          },
        ],
        { session },
      );
      await writeAudit(
        {
          user: receivedBy,
          action: 'payment.record',
          entityType: 'Payment',
          entityId: paymentId,
          property: propertyId,
          after: { amountPaise, method, receiptNumber, advancePaise: plan.advancePaise, allocations: plan.lines.length, status: 'recorded' },
          meta: { residentId: String(residentId), idempotent: Boolean(key) },
        },
        session,
      );
      return created;
    } catch (err) {
      if (err?.code === 11000 && err.keyPattern?.idempotencyKey) throw new DuplicateKeyError();
      throw err;
    }
  });
};

/**
 * Records money received (trusted core: callers authorize first, see recordPaymentAs).
 * Idempotent when `idempotencyKey` is given: a repeat returns the stored payment and changes
 * nothing. Returns { payment, replayed }.
 */
export const recordPayment = async (input) => {
  const { propertyId, residentId, amountPaise, allocations, idempotencyKey } = input;
  if (!isPaise(amountPaise) || amountPaise < 1) throw fieldError('amountPaise', 'Must be a whole number of paise, at least 1');
  if (allocations?.some((a) => !isPaise(a.amountPaise) || a.amountPaise < 1)) {
    throw fieldError('allocations', 'Allocation amounts must be whole paise, at least 1');
  }
  const paidAt = input.paidAt ?? new Date();
  if (paidAt.getTime() > Date.now() + 60_000) throw fieldError('paidAt', 'Cannot be in the future');

  const key = namespacedKey(propertyId, idempotencyKey);
  if (key) {
    const existing = await findByKey(key);
    if (existing) {
      assertSameRequest(existing, input);
      return { payment: existing, replayed: true };
    }
  }

  const property = await Property.findById(propertyId).lean();
  if (!property) throw ApiError.notFound('Property not found');
  const ctx = { property, today: businessToday(), graceDays: graceDaysFor(property), key };

  let payment;
  for (let attempt = 1; ; attempt += 1) {
    try {
      payment = await attemptRecord({ ...input, paidAt }, ctx);
      break;
    } catch (err) {
      if (err instanceof DuplicateKeyError) {
        const existing = await findByKey(key);
        assertSameRequest(existing, input);
        return { payment: existing, replayed: true };
      }
      // Only auto-allocation can safely re-plan after losing a race.
      if (err.stale && !allocations?.length && attempt < MAX_AUTO_RETRIES) continue;
      throw err;
    }
  }

  await Promise.all(
    payment.allocations.map((a) => refreshChargeStatus(a.charge, { today: ctx.today, graceDays: ctx.graceDays })),
  );
  await reconcileOverdue(propertyId, ctx.today, { residentId });
  await notify('payment_recorded', { payment });
  return { payment: payment.toObject(), replayed: false };
};

const loadResidentFor = async (user, propertyId, residentId) => {
  await assertPropertyAccess(user, propertyId, { permission: WRITE });
  const resident = await loadInScope(Resident, residentId, user, { label: 'Resident' });
  if (String(resident.property) !== String(propertyId)) {
    throw fieldError('residentId', 'Resident does not belong to this property');
  }
  return resident;
};

/** Authorized entry point used by the API. `dryRun` previews the allocation and new balance. */
export const recordPaymentAs = async (user, input) => {
  const resident = await loadResidentFor(user, input.propertyId, input.residentId);

  if (input.dryRun) {
    const property = await Property.findById(input.propertyId).lean();
    const today = businessToday();
    const plan = await planAllocations({ ...input, today, graceDays: graceDaysFor(property) });
    const before = await getResidentBalance(resident._id, { today });
    const applied = plan.lines.reduce((sum, l) => sum + l.amountPaise, 0);
    return {
      dryRun: true,
      allocations: plan.lines.map((l) => {
        const before = outstandingOf(l.charge, l.charge.paidPaise);
        return {
          chargeId: String(l.charge._id),
          periodKey: l.charge.periodKey,
          amountPaise: l.amountPaise,
          outstandingBeforePaise: before,
          outstandingAfterPaise: before - l.amountPaise,
        };
      }),
      advancePaise: plan.advancePaise,
      currentOutstandingPaise: before.outstandingPaise,
      projectedOutstandingPaise: before.outstandingPaise - applied,
    };
  }
  return recordPayment({ ...input, receivedBy: user._id });
};

/* ---------------- reversal & verification ---------------- */

export const reversePayment = async (user, paymentId, { reason }) => {
  const original = await loadInScope(Payment, paymentId, user, { label: 'Payment' });
  if (original.reversalOf) throw ApiError.conflict('A reversal entry cannot itself be reversed');
  if (original.status === 'reversed') throw ApiError.conflict('Payment has already been reversed');

  const property = await Property.findById(original.property).lean();
  const advance = original.advancePaise > 0 ? await Advance.findOne({ payment: original._id }) : null;
  if (advance?.consumedByChargeIds.length) throw ApiError.conflict('Advance from this payment has already been applied');

  const priorStatus = original.status;
  const reversal = await runAtomic(async ({ session, onRollback }) => {
    // Claim first: only one concurrent request can flip the status.
    const claimed = await Payment.findOneAndUpdate(
      { _id: original._id, status: { $in: ['recorded', 'verified'] } },
      { $set: { status: 'reversed', reversedBy: user._id, reversedAt: new Date() } },
      { new: true, session },
    );
    if (!claimed) throw ApiError.conflict('Payment has already been reversed');
    onRollback(() =>
      Payment.updateOne({ _id: original._id }, { $set: { status: priorStatus }, $unset: { reversedBy: 1, reversedAt: 1 } }),
    );

    for (const a of original.allocations) {
      const reopened = await RentCharge.findOneAndUpdate(
        { _id: a.charge, paidPaise: { $gte: a.amountPaise } },
        { $inc: { paidPaise: -a.amountPaise } },
        { new: true, session },
      );
      if (!reopened) throw ApiError.conflict('Charge ledger is inconsistent; reversal aborted');
      onRollback(() => RentCharge.updateOne({ _id: a.charge }, { $inc: { paidPaise: a.amountPaise } }));
    }

    if (advance) {
      await Advance.updateOne({ _id: advance._id }, { $set: { reversedAt: new Date() } }, { session });
      onRollback(() => Advance.updateOne({ _id: advance._id }, { $unset: { reversedAt: 1 } }));
    }

    const receiptNumber = await receiptNumberFor(property, session);
    const [entry] = await Payment.create(
      [
        {
          property: original.property,
          resident: original.resident,
          allocations: original.allocations.map((a) => ({ charge: a.charge, amountPaise: -a.amountPaise })),
          advancePaise: -original.advancePaise,
          amountPaise: -original.amountPaise,
          method: original.method,
          reference: original.reference,
          paidAt: new Date(),
          receivedBy: user._id,
          receiptNumber,
          reversalOf: original._id,
          notes: reason,
        },
      ],
      { session },
    );
    await writeAudit(
      {
        user,
        action: 'payment.reverse',
        entityType: 'Payment',
        entityId: original._id,
        property: original.property,
        before: { status: priorStatus, amountPaise: original.amountPaise },
        after: { status: 'reversed' },
        meta: { reason, reversalPaymentId: String(entry._id), reversalReceipt: entry.receiptNumber },
      },
      session,
    );
    return entry;
  });

  const today = businessToday();
  await Promise.all(
    original.allocations.map((a) => refreshChargeStatus(a.charge, { today, graceDays: graceDaysFor(property) })),
  );
  await reconcileOverdue(original.property, today, { residentId: original.resident });
  return { reversal: reversal.toObject(), original: await Payment.findById(original._id).lean() };
};

/** The only way a payment becomes 'verified': an owner confirms it (e.g. against a bank statement). */
export const verifyPayment = async (user, paymentId) => {
  const payment = await loadInScope(Payment, paymentId, user, { label: 'Payment' });
  if (payment.reversalOf) throw ApiError.conflict('Reversal entries cannot be verified');
  const verified = await Payment.findOneAndUpdate(
    { _id: payment._id, status: 'recorded' },
    { $set: { status: 'verified', verifiedBy: user._id, verifiedAt: new Date() } },
    { new: true },
  ).lean();
  if (!verified) throw ApiError.conflict(`Payment is ${payment.status} and cannot be verified`);
  await writeAudit({ user, action: 'payment.verify', entityType: 'Payment', entityId: payment._id, property: payment.property, before: { status: 'recorded' }, after: { status: 'verified' } });
  return verified;
};

/* ---------------- reads ---------------- */

const populatePayment = (query) =>
  query.populate('resident', 'fullName phone').populate('receivedBy', 'name').populate('allocations.charge', 'periodKey');

export const listPayments = async (user, { propertyId, residentId, from, to, method, ...paging }) => {
  const filter = await scopeFilter(user, propertyId, residentId, { permission: PERMISSIONS.PAYMENTS_VIEW });
  if (method) filter.method = method;
  if (from || to) filter.paidAt = { ...(from && { $gte: from }), ...(to && { $lt: addDays(to, 1) }) };

  const [items, total] = await Promise.all([
    populatePayment(
      Payment.find(filter).sort({ paidAt: -1, createdAt: -1 }).skip(paginate(paging).skip).limit(paging.limit),
    ).lean(),
    Payment.countDocuments(filter),
  ]);
  return { items, pagination: pageMeta(paging, total) };
};

export const getPayment = async (user, id) => {
  const payment = await loadInScope(Payment, id, user, { label: 'Payment', permission: PERMISSIONS.PAYMENTS_VIEW });
  return populatePayment(Payment.findById(payment._id)).lean();
};

/** JSON receipt (a PDF renderer can consume the same payload later). */
export const getReceipt = async (user, id) => {
  const payment = await getPayment(user, id);
  const [property, reversalEntry] = await Promise.all([
    Property.findById(payment.property, { name: 1, address: 1, contact: 1, code: 1 }).lean(),
    payment.status === 'reversed' ? Payment.findOne({ reversalOf: payment._id }, { receiptNumber: 1 }).lean() : null,
  ]);
  return {
    receiptNumber: payment.receiptNumber,
    status: payment.status,
    verified: payment.status === 'verified',
    isReversal: Boolean(payment.reversalOf),
    reversedByReceipt: reversalEntry?.receiptNumber ?? null,
    property: { name: property.name, code: property.code, address: property.address, contact: property.contact },
    resident: { id: String(payment.resident._id), fullName: payment.resident.fullName },
    amountPaise: payment.amountPaise,
    advancePaise: payment.advancePaise,
    method: payment.method,
    reference: payment.reference ?? null,
    paidAt: payment.paidAt,
    receivedBy: payment.receivedBy?.name ?? null,
    notes: payment.notes ?? null,
    allocations: payment.allocations.map((a) => ({
      chargeId: String(a.charge._id),
      periodKey: a.charge.periodKey,
      amountPaise: a.amountPaise,
    })),
    issuedAt: payment.createdAt,
  };
};
