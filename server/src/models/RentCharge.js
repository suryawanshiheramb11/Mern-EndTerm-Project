import mongoose from 'mongoose';
import { paiseField, signedPaiseField } from '../utils/money.js';

export const CHARGE_STATUSES = ['pending', 'partial', 'paid', 'overdue', 'waived'];
export const PERIOD_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const ref = (model, extra = {}) => ({ type: mongoose.Schema.Types.ObjectId, ref: model, ...extra });

const adjustmentSchema = new mongoose.Schema(
  {
    amountPaise: { ...signedPaiseField(), required: true },
    reason: { type: String, required: true, trim: true, minlength: 1, maxlength: 300 },
    kind: { type: String, enum: ['adjustment', 'waiver', 'late_fee'], default: 'adjustment' },
    createdBy: ref('User'),
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/*
 * RentCharge = what a resident OWES for one billing period. It is never deleted; corrections are
 * adjustments. Deposits are liabilities and never appear here.
 *
 *   netDuePaise = amountPaise - discountPaise + sum(adjustments)   (kept in step by chargeService)
 *   paidPaise   = sum of payment allocations to this charge. It is a guarded cache of the payment
 *                 ledger (Payment.allocations is the source of truth) so concurrent payments cannot
 *                 over-allocate: every increment is conditional on paidPaise <= netDuePaise.
 *   status      = derived by deriveStatus() and persisted; never set directly by clients.
 */
const rentChargeSchema = new mongoose.Schema(
  {
    property: ref('Property', { required: true, index: true }),
    resident: ref('Resident', { required: true, index: true }),
    stay: ref('Stay', { required: true, index: true }),
    periodKey: { type: String, required: true, match: PERIOD_KEY_RE, index: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    amountPaise: { ...paiseField(), required: true },
    discountPaise: { ...paiseField(), default: 0 },
    adjustments: { type: [adjustmentSchema], default: [] },
    netDuePaise: { ...paiseField(), required: true },
    paidPaise: { ...paiseField(), default: 0 },
    dueDate: { type: Date, required: true, index: true },
    status: { type: String, enum: CHARGE_STATUSES, default: 'pending', index: true },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

// Idempotency: one charge per stay per period, enforced by the database.
rentChargeSchema.index({ stay: 1, periodKey: 1 }, { unique: true });
rentChargeSchema.index({ property: 1, status: 1, dueDate: 1 });
rentChargeSchema.index({ resident: 1, periodKey: 1 });

// Charges are never deleted; corrections are adjustments.
const forbidDelete = function forbidDelete(next) {
  next(new Error('Rent charges cannot be deleted; use an adjustment or a waiver'));
};
for (const hook of ['deleteOne', 'deleteMany', 'findOneAndDelete']) rentChargeSchema.pre(hook, forbidDelete);
rentChargeSchema.pre('deleteOne', { document: true, query: false }, forbidDelete);

export const RentCharge = mongoose.model('RentCharge', rentChargeSchema);
export default RentCharge;
