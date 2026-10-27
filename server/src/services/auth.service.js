import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { REFRESH_TTL_MS } from '../utils/cookies.js';
import { LoginOtp } from '../models/LoginOtp.js';
import { generateToken, hashToken, safeEqual, signAccessToken } from '../utils/tokens.js';
import { sendEmail } from './emailTransport.js';
import crypto from 'node:crypto';

const MAX_FAILED_LOGINS = 10;
const LOCK_MS = 15 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

// Compared against when the email is unknown so response time doesn't reveal account existence.
const dummyHash = bcrypt.hash('stayos-dummy-password', 12);

// No email provider yet: surface raw tokens in the console outside production.
export const deliverToken = (kind, email, token) => {
  if (!env.isProd) logger.info(`[dev] ${kind} token for ${email}: ${token}`);
};

const issueSession = async (user, { userAgent, ip }) => {
  const refreshToken = generateToken(48);
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    userAgent,
    ip,
  });
  return { accessToken: signAccessToken(user), refreshToken };
};

const revokeAllSessions = (userId) =>
  RefreshToken.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });

export const register = async ({ name, email, password, role }, meta) => {
  if (role !== 'owner') throw ApiError.forbidden('Only owners can self-register; other roles must be invited');
  if (await User.exists({ email })) throw ApiError.conflict('Email is already registered');

  const verificationToken = generateToken();
  const user = new User({
    name,
    email,
    role,
    emailVerificationToken: hashToken(verificationToken),
    emailVerificationExpires: new Date(Date.now() + VERIFY_TTL_MS),
  });
  user.password = password;
  await user.save();

  deliverToken('email verification', email, verificationToken);
  return { user, tokens: await issueSession(user, meta) };
};

const tooManyAttempts = () => new ApiError(429, 'Too many failed attempts. Please try again in 15 minutes.');

export const login = async ({ email, password }, meta) => {
  const user = await User.findOne({ email }).select('+passwordHash +lockedUntil');
  if (user?.lockedUntil > new Date()) throw tooManyAttempts();
  const valid = await bcrypt.compare(password, user ? user.passwordHash : await dummyHash);
  if (!user || !valid) {
    if (user) {
      // Atomic counter; the tenth miss locks the account for 15 minutes.
      const { failedLoginCount } = await User.findByIdAndUpdate(user._id, { $inc: { failedLoginCount: 1 } }, { new: true, select: '+failedLoginCount' }).lean();
      if (failedLoginCount >= MAX_FAILED_LOGINS) await User.updateOne({ _id: user._id }, { $set: { lockedUntil: new Date(Date.now() + LOCK_MS), failedLoginCount: 0 } });
    }
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (user.status !== 'active') throw ApiError.forbidden(`Account is ${user.status}`);

  user.lastLoginAt = new Date();
  user.failedLoginCount = 0;
  user.lockedUntil = undefined;
  await user.save();
  return { user, tokens: await issueSession(user, meta) };
};

export const logout = async (refreshToken) => {
  if (!refreshToken) return;
  await RefreshToken.updateOne({ tokenHash: hashToken(refreshToken), revokedAt: null }, { revokedAt: new Date() });
};

export const refresh = async (refreshToken, meta) => {
  if (!refreshToken) throw ApiError.unauthorized('Session expired');

  const tokenHash = hashToken(refreshToken);
  // Atomic revoke-on-use: only one concurrent request can consume a given token.
  const consumed = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: new Date() } },
    { revokedAt: new Date() },
  );

  if (!consumed) {
    const known = await RefreshToken.findOne({ tokenHash });
    // A revoked token being replayed means it may have been stolen: kill every session.
    if (known?.revokedAt) await revokeAllSessions(known.user);
    throw ApiError.unauthorized('Session expired');
  }

  const user = await User.findById(consumed.user);
  if (!user || user.status !== 'active') throw ApiError.unauthorized('Session expired');
  return { user, tokens: await issueSession(user, meta) };
};

export const forgotPassword = async (email) => {
  const user = await User.findOne({ email });
  if (!user) return;

  const token = generateToken();
  user.passwordResetToken = hashToken(token);
  user.passwordResetExpires = new Date(Date.now() + RESET_TTL_MS);
  await user.save();
  deliverToken('password reset', email, token);
};

export const resetPassword = async ({ token, password }) => {
  const user = await User.findOne({
    passwordResetToken: hashToken(token),
    passwordResetExpires: { $gt: new Date() },
  });
  if (!user) throw ApiError.badRequest('Invalid or expired token');

  user.password = password;
  if (user.status === 'invited') {
    // The invite token proves control of the mailbox, so setting a password activates the account.
    user.status = 'active';
    user.emailVerified = true;
  }
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();
  await revokeAllSessions(user._id);
};

export const verifyEmail = async (token) => {
  const user = await User.findOne({
    emailVerificationToken: hashToken(token),
    emailVerificationExpires: { $gt: new Date() },
  });
  if (!user) throw ApiError.badRequest('Invalid or expired token');

  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();
};

/** Signed-in password change. The current password is required unless a temporary one is being replaced. */
export const changePassword = async (userId, { currentPassword, newPassword }, meta) => {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user.mustChangePassword) {
    if (!currentPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) throw ApiError.badRequest('Current password is incorrect');
  } else if (currentPassword && !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  if (await bcrypt.compare(newPassword, user.passwordHash)) throw ApiError.badRequest('Choose a password you have not used just now');
  if (newPassword.toLowerCase().includes(user.email.split('@')[0]) && user.email.split('@')[0].length >= 4) throw ApiError.badRequest('Password must not contain your email name');

  user.password = newPassword;
  user.mustChangePassword = false;
  user.passwordChangedAt = new Date();
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();
  await revokeAllSessions(user._id);
  return { user, tokens: await issueSession(user, meta) };
};

/** Sets a password chosen by an owner or generated for them: forces a change at the next sign-in. */
export const setTemporaryPassword = async (user, password) => {
  user.password = password;
  user.mustChangePassword = true;
  user.passwordChangedAt = new Date();
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  user.failedLoginCount = 0;
  user.lockedUntil = undefined;
  if (user.status === 'invited') user.status = 'active';
  user.emailVerified = true; // the owner vouches for the address
  await user.save();
  await revokeAllSessions(user._id);
};

export const revokeSessionsFor = revokeAllSessions;

/* ---------------- Google sign-in ---------------- */

// Google's own endpoint checks the signature and expiry; we then check audience, issuer and verified email.
const verifyGoogleCredential = async (credential) => {
  if (!env.GOOGLE_CLIENT_ID) throw new ApiError(503, 'Google sign-in is not configured');
  let res;
  try {
    res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new ApiError(502, 'Could not reach Google');
  }
  if (!res.ok) throw ApiError.unauthorized('Google sign-in failed');
  const info = await res.json();
  const issuerOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  if (info.aud !== env.GOOGLE_CLIENT_ID || !issuerOk || String(info.email_verified) !== 'true' || !info.email) throw ApiError.unauthorized('Google sign-in failed');
  return { email: String(info.email).toLowerCase(), name: info.name || String(info.email).split('@')[0] };
};

export const googleSignIn = async ({ credential, intent }, meta) => {
  const { email, name } = await verifyGoogleCredential(credential);
  let user = await User.findOne({ email });
  if (!user) {
    if (intent !== 'register') throw ApiError.notFound('No StayOS account uses this Google email. Register as an owner, or ask your owner to add you.');
    user = new User({ name: name.slice(0, 80).padEnd(2, ' '), email, role: 'owner', emailVerified: true });
    user.password = generateToken(24); // unusable; Google is how they sign in until they set one
    await user.save();
  } else {
    if (user.status === 'suspended') throw ApiError.forbidden('Account is suspended');
    // Google proves control of the mailbox, which is exactly what an invite link proves.
    if (user.status === 'invited' || !user.emailVerified) {
      user.status = 'active';
      user.emailVerified = true;
    }
  }
  user.lastLoginAt = new Date();
  await user.save();
  return { user, tokens: await issueSession(user, meta) };
};

/* ---------------- One-time code sign-in (email) ---------------- */

const otpHash = (userId, code) => hashToken(`${userId}:${code}`);

/** Always resolves quietly, so the response never reveals whether an email is registered. */
export const requestOtp = async (email) => {
  if (!env.OTP_ENABLED) throw new ApiError(503, 'Sign-in codes are not available right now');
  const user = await User.findOne({ email });
  if (!user || user.status === 'suspended') return;
  const existing = await LoginOtp.findOne({ user: user._id }).lean();
  if (existing && Date.now() - new Date(existing.updatedAt).getTime() < OTP_RESEND_MS) return; // resend cooldown

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await LoginOtp.findOneAndUpdate(
    { user: user._id },
    { codeHash: otpHash(user._id, code), attempts: 0, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    { upsert: true, setDefaultsOnInsert: true },
  );
  deliverToken('sign-in code', email, code);
  try {
    await sendEmail({ to: email, subject: 'Your StayOS sign-in code', text: `Your StayOS sign-in code is ${code}. It expires in 10 minutes. If you did not ask for it, ignore this email.` });
  } catch (err) {
    logger.error('Sign-in code email failed', err.message);
  }
};

export const verifyOtp = async ({ email, code }, meta) => {
  const bad = () => ApiError.unauthorized('Invalid or expired code');
  const user = await User.findOne({ email });
  if (!user) throw bad();
  const otp = await LoginOtp.findOne({ user: user._id });
  if (!otp || otp.expiresAt < new Date()) throw bad();
  // Count the attempt before comparing, atomically, so parallel guesses cannot beat the limit.
  const counted = await LoginOtp.findOneAndUpdate({ _id: otp._id, attempts: { $lt: OTP_MAX_ATTEMPTS } }, { $inc: { attempts: 1 } });
  if (!counted) {
    await LoginOtp.deleteOne({ _id: otp._id });
    throw bad();
  }
  if (!safeEqual(otp.codeHash, otpHash(user._id, code))) throw bad();
  await LoginOtp.deleteOne({ _id: otp._id });
  if (user.status === 'suspended') throw ApiError.forbidden('Account is suspended');
  if (user.status === 'invited') {
    user.status = 'active';
    user.emailVerified = true;
  }
  user.lastLoginAt = new Date();
  await user.save();
  return { user, tokens: await issueSession(user, meta) };
};
