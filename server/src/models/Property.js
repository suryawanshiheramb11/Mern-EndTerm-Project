import mongoose from 'mongoose';

export const PROPERTY_TYPES = ['pg', 'hostel', 'apartment'];

const propertySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    // Short unique code used in receipt numbers; assigned lazily by the payment service.
    code: { type: String, uppercase: true, trim: true, unique: true, sparse: true },
    type: { type: String, enum: PROPERTY_TYPES, default: 'pg' },
    address: {
      line1: { type: String, required: true, trim: true },
      line2: { type: String, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      pincode: { type: String, required: true, trim: true, minlength: 4, maxlength: 10 },
      country: { type: String, default: 'IN', uppercase: true, trim: true },
    },
    contact: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, lowercase: true, trim: true },
    },
    facilities: { type: [String], default: [] },
    settings: {
      currency: { type: String, default: 'INR' },
      billingDay: { type: Number, default: 1, min: 1, max: 28 },
      gracePeriodDays: { type: Number, default: 5, min: 0 },
      lateFeePercent: { type: Number, default: 0, min: 0, max: 100 },
    },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const Property = mongoose.model('Property', propertySchema);
export default Property;
