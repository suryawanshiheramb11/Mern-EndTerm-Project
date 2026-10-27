import mongoose from 'mongoose';

// One live sign-in code per user. Only a hash is stored; the row expires on its own.
const loginOtpSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

export const LoginOtp = mongoose.model('LoginOtp', loginOtpSchema);
export default LoginOtp;
