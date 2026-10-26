import mongoose from 'mongoose';
import { paiseField } from '../utils/money.js';

export const STAY_STATUSES = ['active', 'ended'];
export const END_REASONS = ['checkout', 'transfer', 'eviction', 'other'];

const ref = (model, extra = {}) => ({ type: mongoose.Schema.Types.ObjectId, ref: model, ...extra });

/*
 * A stay is one resident in one bed over a date range. Transfers end a stay and open a new one
 * (linked by transferredFromStay / transferredToStay) so each bed-period keeps its own record.
 * Rent charges and payments (later phases) attach to the resident and stay chain, never to beds.
 *
 * Phase 5 closes a stay by setting status 'ended', actualCheckOutDate and endedReason; no schema
 * change is needed. Deposit is held against the latest stay in a transfer chain.
 *
 * A reservation is an active stay with a future checkInDate and `reservationTimer` set (to that
 * date); its bed is 'reserved'. A later job promotes it: bed -> 'occupied', reservationTimer unset.
 */
const staySchema = new mongoose.Schema(
  {
    property: ref('Property', { required: true, index: true }),
    resident: ref('Resident', { required: true, index: true }),
    room: ref('Room', { required: true }),
    bed: ref('Bed', { required: true, index: true }),
    status: { type: String, enum: STAY_STATUSES, default: 'active', index: true },
    checkInDate: { type: Date, required: true },
    expectedCheckOutDate: { type: Date },
    actualCheckOutDate: { type: Date },
    reservationTimer: { type: Date },
    monthlyRentPaise: { ...paiseField(), required: true },
    depositPaise: { ...paiseField(), required: true, default: 0 },
    billingDay: { type: Number, min: 1, max: 28, required: true },
    agreedDiscountPaise: { ...paiseField(), default: 0 },
    termsAcknowledgedAt: { type: Date },
    createdBy: ref('User'),
    endedReason: { type: String, enum: END_REASONS },
    endedNote: { type: String, trim: true, maxlength: 300 },
    // Set by the check-out commit, for audit: who/when, rent still unpaid at that moment, and the
    // deposit held. Never recomputed afterwards.
    checkoutRequestedAt: { type: Date },
    checkoutRequestedBy: ref('User'),
    finalDuesSnapshotPaise: { ...paiseField() },
    depositSnapshotPaise: { ...paiseField() },
    transferredFromStay: ref('Stay'),
    transferredToStay: ref('Stay'),
  },
  { timestamps: true },
);

staySchema.index({ bed: 1, status: 1 });
staySchema.index({ resident: 1, status: 1 });
staySchema.index({ property: 1, status: 1 });

// Database-level guarantees behind the application checks: at most one active stay per bed, and
// per resident (a resident belongs to exactly one property, so this is "per property" too).
staySchema.index(
  { bed: 1 },
  { unique: true, partialFilterExpression: { status: 'active' }, name: 'uniq_active_stay_per_bed' },
);
staySchema.index(
  { resident: 1 },
  { unique: true, partialFilterExpression: { status: 'active' }, name: 'uniq_active_stay_per_resident' },
);

export const Stay = mongoose.model('Stay', staySchema);
export default Stay;
