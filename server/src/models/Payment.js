import mongoose from 'mongoose';
import { signedPaiseField } from '../utils/money.js';

export const PAYMENT_METHODS = ['cash', 'upi', 'bank', 'card', 'razorpay', 'other'];
export const PAYMENT_STATUSES = ['recorded', 'verified', 'reversed'];

const ref = (model, extra = {}) => ({ type: mongoose.Schema.Types.ObjectId, ref: model, ...extra });

const allocationSchema = new mongoose.Schema(
  {
    charge: ref('RentCharge', { required: true }),
    // Negative only on reversal entries, which mirror the original allocations.
    amountPaise: { ...signedPaiseField(), required: true },
  },
  { _id: false },
);

/*
 * Payment = money ACTUALLY RECEIVED. Append-only: the money fields are immutable and payments are
 * never deleted. A correction is a reversal entry (negative amount, reversalOf -> original) plus a
 * new payment. Only the lifecycle fields (status, verifiedBy/At, reversedBy/At) ever change.
 *
 * Invariant: sum(allocations) + advancePaise === amountPaise. 'verified' is only ever set by
 * paymentService.verifyPayment (owner action); online (Razorpay) payments are recorded as 'verified' only after signature check.
 */
const paymentSchema = new mongoose.Schema(
  {
    property: ref('Property', { required: true, index: true, immutable: true }),
    resident: ref('Resident', { required: true, index: true, immutable: true }),
    allocations: { type: [allocationSchema], default: [], immutable: true },
    amountPaise: { ...signedPaiseField(), required: true, immutable: true },
    // The part of amountPaise held as an advance (see Advance) instead of allocated to a charge.
    advancePaise: { ...signedPaiseField(), default: 0, immutable: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true, immutable: true },
    reference: { type: String, trim: true, maxlength: 100, immutable: true },
    paidAt: { type: Date, default: Date.now, immutable: true },
    receivedBy: ref('User', { immutable: true }),
    receiptNumber: { type: String, required: true, unique: true, immutable: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'recorded', index: true },
    // Stored namespaced as `<propertyId>:<client key>` so keys never collide across tenants.
    idempotencyKey: { type: String, unique: true, sparse: true, immutable: true },
    reversalOf: ref('Payment', { immutable: true }),
    notes: { type: String, trim: true, maxlength: 300, immutable: true },
    verifiedBy: ref('User'),
    verifiedAt: { type: Date },
    reversedBy: ref('User'),
    reversedAt: { type: Date },
  },
  { timestamps: true },
);

paymentSchema.index({ property: 1, paidAt: -1 });
paymentSchema.index({ resident: 1, paidAt: -1 });
paymentSchema.index({ 'allocations.charge': 1 });
paymentSchema.index({ reversalOf: 1 }, { unique: true, sparse: true }); // at most one reversal per payment

paymentSchema.pre('validate', function checkInvariants(next) {
  const isReversal = Boolean(this.reversalOf);
  if (this.amountPaise === 0 || (isReversal ? this.amountPaise > 0 : this.amountPaise < 1)) {
    return next(new Error(isReversal ? 'Reversal amount must be negative' : 'Payment amount must be at least 1 paise'));
  }
  const allocated = this.allocations.reduce((sum, a) => sum + a.amountPaise, 0);
  if (allocated + (this.advancePaise ?? 0) !== this.amountPaise) {
    return next(new Error('Allocations plus advance must equal the payment amount'));
  }
  return next();
});

const forbid = function forbid(next) {
  next(new Error('Payments cannot be deleted or replaced; record a reversal instead'));
};
for (const hook of ['deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndReplace', 'replaceOne']) {
  paymentSchema.pre(hook, forbid);
}
paymentSchema.pre('deleteOne', { document: true, query: false }, forbid);

export const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
