import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const generateToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

export const signAccessToken = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES,
  });

export const verifyAccessToken = (token) =>
  jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
