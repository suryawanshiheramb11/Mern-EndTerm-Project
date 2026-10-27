import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const generateToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // no look-alikes (0 O 1 l I)
/** A random temporary password: 14 characters, always containing upper, lower and a digit. */
export const generateTempPassword = () => {
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = Array.from({ length: 11 }, () => pick(PASSWORD_ALPHABET));
  chars.push(pick('ABCDEFGHJKLMNPQRSTUVWXYZ'), pick('abcdefghijkmnopqrstuvwxyz'), pick('23456789'));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

export const signAccessToken = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role, v: user.tokenVersion ?? 0 }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES,
  });

export const verifyAccessToken = (token) =>
  jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
