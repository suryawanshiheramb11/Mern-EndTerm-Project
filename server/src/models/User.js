import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ALL_ASSIGNABLE } from '../config/permissions.js';

export const USER_ROLES = ['owner', 'warden', 'student', 'maintenance'];
export const USER_STATUSES = ['active', 'invited', 'suspended'];

const BCRYPT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, required: true, default: 'owner' },
    status: { type: String, enum: USER_STATUSES, default: 'active' },
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date },
    lastLoginAt: { type: Date },
    // Populated from Phase 2 onward: grants staff (warden/maintenance) access to specific
    // properties. Owners are scoped by Property.owner instead and leave this empty.
    propertyAccess: {
      type: [
        {
          _id: false,
          property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
          // Mirrors the user's role at the time access was granted; the user's role is authoritative.
          role: { type: String, enum: ['warden', 'maintenance'] },
          permissions: { type: [{ type: String, enum: ALL_ASSIGNABLE }], default: [] },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

userSchema.index({ role: 1 });

// Assign the plaintext via `user.password = ...`; it is hashed before validation so the
// required passwordHash check passes and the plaintext is never persisted.
userSchema.virtual('password').set(function setPassword(value) {
  this._password = value;
});

userSchema.pre('validate', async function hashPassword(next) {
  if (this._password) {
    this.passwordHash = await bcrypt.hash(this._password, BCRYPT_ROUNDS);
    this._password = undefined;
  }
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    status: this.status,
    emailVerified: this.emailVerified,
    lastLoginAt: this.lastLoginAt,
    propertyAccess: this.propertyAccess.map((a) => ({
      property: a.property.toString(),
      role: a.role ?? this.role,
      permissions: a.permissions,
    })),
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const User = mongoose.model('User', userSchema);
export default User;
