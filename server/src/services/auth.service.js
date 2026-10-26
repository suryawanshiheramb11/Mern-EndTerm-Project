import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { REFRESH_TTL_MS } from '../utils/cookies.js';
import { generateToken, hashToken, signAccessToken } from '../utils/tokens.js';

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

export const login = async ({ email, password }, meta) => {
  const user = await User.findOne({ email }).select('+passwordHash');
  const valid = await bcrypt.compare(password, user ? user.passwordHash : await dummyHash);
  if (!user || !valid) throw ApiError.unauthorized('Invalid email or password');
  if (user.status !== 'active') throw ApiError.forbidden(`Account is ${user.status}`);

  user.lastLoginAt = new Date();
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
