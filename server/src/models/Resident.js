import mongoose from 'mongoose';

export const RESIDENT_STATUSES = ['active', 'former'];
export const GENDERS = ['female', 'male', 'other'];
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
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
    dateOfBirth: { type: Date },
    gender: { type: String, enum: GENDERS },
    permanentAddress: { type: String, trim: true, maxlength: 300 },
    // College or workplace.
    institution: { type: String, trim: true, maxlength: 150 },
    // Parent or guardian. Visible to owner and wardens only (never maintenance).
    guardian: {
      name: { type: String, trim: true, maxlength: 100 },
      relation: { type: String, trim: true, maxlength: 40 },
      phone: { type: String, trim: true },
      email: { type: String, lowercase: true, trim: true },
      address: { type: String, trim: true, maxlength: 300 },
    },
    // Health information the owner may need in an emergency. Visible to owner and wardens only.
    medical: {
      bloodGroup: { type: String, enum: BLOOD_GROUPS },
      conditions: { type: String, trim: true, maxlength: 500 },
      allergies: { type: String, trim: true, maxlength: 500 },
      medications: { type: String, trim: true, maxlength: 500 },
      doctorName: { type: String, trim: true, maxlength: 100 },
      doctorPhone: { type: String, trim: true },
      insurance: { type: String, trim: true, maxlength: 200 },
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
