import mongoose from 'mongoose';
import { paiseField } from '../utils/money.js';

export const REFUND_TYPES = ['deposit'];
export const REFUND_STATUSES = ['pending_approval', 'approved', 'paid', 'cancelled'];
export const REFUND_METHODS = ['cash', 'upi', 'bank'];

const ref = (model, extra = {}) => ({ type: mongoose.Schema.Types.ObjectId, ref: model, ...extra });

const deductionSchema = new mongoose.Schema(
  {
    amountPaise: { ...paiseField(), required: true, min: 1 },
    reason: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    evidenceRef: { type: String, trim: true, maxlength: 200 },
    // True for the line the system adds when outstanding rent is netted against the deposit.
    system: { type: Boolean, default: false },
  },
  { _id: false },
);

/*
 * Refund = money RETURNED to a resident; today only the security deposit at check-out. Exactly one
 * per stay (unique index). The deposit is a liability, so none of this touches rent revenue and no
 * payment is created or edited: unpaid rent netted against the deposit is a deduction here.
 *
 *   refundablePaise = originalDepositPaise - totalDeductionsPaise     (never negative)
 *
 * Lifecycle: pending_approval -> approved -> paid, or pending_approval -> cancelled. 'paid' is set
 * only by the explicit pay action. A cancelled refund is not recreated; the stay is already ended.
 */
const refundSchema = new mongoose.Schema(
  {
    property: ref('Property', { required: true, index: true }),
    resident: ref('Resident', { required: true, index: true }),
    stay: ref('Stay', { required: true }),
    type: { type: String, enum: REFUND_TYPES, default: 'deposit' },
    originalDepositPaise: { ...paiseField(), required: true },
    deductions: { type: [deductionSchema], default: [] },
    totalDeductionsPaise: { ...paiseField(), required: true, default: 0 },
    // Rent still owed when the stay ended, and how much of it was netted against the deposit.
    outstandingRentPaise: { ...paiseField(), default: 0 },
    outstandingRentDeductedPaise: { ...paiseField(), default: 0 },
    refundablePaise: { ...paiseField(), required: true },
    status: { type: String, enum: REFUND_STATUSES, default: 'pending_approval', index: true },
    approvedBy: ref('User'),
    approvedAt: { type: Date },
    method: { type: String, enum: REFUND_METHODS },
    reference: { type: String, trim: true, maxlength: 100 },
    paidAt: { type: Date },
    notes: { type: String, trim: true, maxlength: 300 },
    createdBy: ref('User'),
  },
  { timestamps: true },
);

refundSchema.index({ stay: 1 }, { unique: true });
refundSchema.index({ property: 1, status: 1 });

refundSchema.pre('validate', function checkTotals(next) {
  const total = this.deductions.reduce((sum, d) => sum + d.amountPaise, 0);
  if (total !== this.totalDeductionsPaise || this.originalDepositPaise - total !== this.refundablePaise) {
    return next(new Error('Refund figures are inconsistent'));
  }
  return next();
});

const forbidDelete = function forbidDelete(next) {
  next(new Error('Refunds cannot be deleted; cancel them instead'));
};
for (const hook of ['deleteOne', 'deleteMany', 'findOneAndDelete']) refundSchema.pre(hook, forbidDelete);
refundSchema.pre('deleteOne', { document: true, query: false }, forbidDelete);

export const Refund = mongoose.model('Refund', refundSchema);
export default Refund;
