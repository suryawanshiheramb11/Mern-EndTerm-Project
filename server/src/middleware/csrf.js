import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { generateToken, safeEqual } from '../utils/tokens.js';

export const CSRF_COOKIE = 'csrfToken';
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Double-submit cookie: the client echoes the readable cookie back in a header.
export const csrfProtection = (req, res, next) => {
  if (!env.CSRF_ENABLED) return next();

  let cookieToken = req.cookies?.[CSRF_COOKIE];
  if (!cookieToken) {
    cookieToken = generateToken(16);
    res.cookie(CSRF_COOKIE, cookieToken, { httpOnly: false, sameSite: 'lax', secure: env.isProd, path: '/' });
  }

  if (SAFE_METHODS.has(req.method)) return next();

  const headerToken = req.get(CSRF_HEADER);
  if (!headerToken || !safeEqual(headerToken, cookieToken)) {
    return next(ApiError.forbidden('Invalid CSRF token'));
  }
  return next();
};

export default csrfProtection;
