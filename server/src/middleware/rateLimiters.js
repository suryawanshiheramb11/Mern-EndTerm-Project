import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const limiter = ({ limit, windowMs = 15 * 60 * 1000, message, ...options }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message },
    ...options,
  });

// Tests share one IP and register many accounts; only the login limiter is exercised there.
const unlessTest = (limit) => (env.isTest ? 1000 : limit);

export const loginLimiter = limiter({
  limit: 5,
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email ?? '').trim().toLowerCase()}`,
});

export const registerLimiter = limiter({
  limit: unlessTest(10),
  windowMs: 60 * 60 * 1000,
  message: 'Too many accounts created, please try again later.',
});

// Blanket limit for every /api/auth route (login has its own, tighter one on top).
export const authLimiter = limiter({ limit: unlessTest(100), message: 'Too many requests, please try again later.' });

// Recording money is the most sensitive write; the global limit is too loose for it.
export const paymentLimiter = limiter({
  limit: unlessTest(120),
  message: 'Too many payment requests, please slow down.',
  keyGenerator: (req) => String(req.user?._id ?? req.ip),
});

// One-time codes: few requests and few guesses per address, on top of the per-account attempt cap.
export const otpLimiter = limiter({
  limit: unlessTest(10),
  message: 'Too many code requests, please try again later.',
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email ?? '').trim().toLowerCase()}`,
});

export const googleLimiter = limiter({ limit: unlessTest(20), message: 'Too many sign-in attempts, please try again later.' });

export const forgotPasswordLimiter = limiter({
  limit: unlessTest(5),
  message: 'Too many requests, please try again later.',
});
