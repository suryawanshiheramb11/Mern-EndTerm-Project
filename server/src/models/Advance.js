import mongoose from 'mongoose';
import { paiseField } from '../utils/money.js';

const ref = (model, extra = {}) => ({ type: mongoose.Schema.Types.ObjectId, ref: model, ...extra });

// Money received beyond what was owed, created only by an explicit allowAdvance payment. It is a
// liability to the resident, shown separately from rent balances. Reversing the payment voids it
// (reversedAt) rather than deleting it. Applying advances to future charges is not implemented yet.
const advanceSchema = new mongoose.Schema(
  {
    property: ref('Property', { required: true, index: true }),
    resident: ref('Resident', { required: true, index: true }),
    payment: ref('Payment', { required: true }),
    amountPaise: { ...paiseField(), required: true, min: 1 },
    consumedByChargeIds: { type: [ref('RentCharge')], default: [] },
    reversedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Advance = mongoose.model('Advance', advanceSchema);
export default Advance;
