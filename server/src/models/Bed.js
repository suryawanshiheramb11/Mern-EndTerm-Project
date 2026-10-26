import mongoose from 'mongoose';
import { paiseField } from '../utils/money.js';

export const BED_STATUSES = ['available', 'occupied', 'reserved', 'maintenance', 'inactive'];

const bedSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    label: { type: String, required: true, trim: true },
    monthlyRent: paiseField(),
    // Invariant: status is stored here, never derived from stays. Phase 3 stay flows (check-in,
    // check-out, reservations) are the only writers of 'occupied' and of releasing it.
    status: { type: String, enum: BED_STATUSES, default: 'available' },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

// The unique pair is also the concurrency guard: simultaneous creates of one label can't both win.
bedSchema.index({ room: 1, label: 1 }, { unique: true });
bedSchema.index({ property: 1, status: 1 });

export const Bed = mongoose.model('Bed', bedSchema);
export default Bed;
