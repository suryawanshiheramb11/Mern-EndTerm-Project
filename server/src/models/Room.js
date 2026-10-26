import mongoose from 'mongoose';
import { paiseField } from '../utils/money.js';

export const ROOM_STATUSES = ['active', 'inactive', 'maintenance'];

const roomSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    number: { type: String, required: true, trim: true },
    floor: { type: Number, default: 0 },
    capacity: { type: Number, required: true, min: 1 },
    defaultMonthlyRent: paiseField(),
    defaultDeposit: paiseField(),
    amenities: { type: [String], default: [] },
    status: { type: String, enum: ROOM_STATUSES, default: 'active' },
  },
  { timestamps: true },
);

roomSchema.index({ property: 1, number: 1 }, { unique: true });
roomSchema.index({ property: 1, status: 1 });

export const Room = mongoose.model('Room', roomSchema);
export default Room;
