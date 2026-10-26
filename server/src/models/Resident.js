import mongoose from 'mongoose';

export const RESIDENT_STATUSES = ['active', 'former'];
export const ID_VERIFICATION_STATUSES = ['pending', 'verified', 'not_required'];

const residentSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    phone: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    emergencyContact: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    // Only the verification outcome and an opaque reference; never raw ID document numbers.
    idVerification: {
      status: { type: String, enum: ID_VERIFICATION_STATUSES, default: 'pending' },
      reference: { type: String, trim: true },
    },
    // Set when the resident is invited to create a login (a User with role 'student').
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: RESIDENT_STATUSES, default: 'active' },
  },
  { timestamps: true },
);

// Not unique: relatives may share a phone number.
residentSchema.index({ property: 1, phone: 1 });
residentSchema.index({ property: 1, email: 1 });

export const Resident = mongoose.model('Resident', residentSchema);
export default Resident;
