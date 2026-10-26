import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const ACCESS_COOKIE = 'accessToken';
export const REFRESH_COOKIE = 'refreshToken';
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const base = { httpOnly: true, sameSite: 'lax', secure: env.isProd };

// The refresh token is only ever needed by the auth endpoints, so scope it to them.
const REFRESH_PATH = '/api/auth';

export const setAuthCookies = (res, { accessToken, refreshToken }) => {
  const { exp } = jwt.decode(accessToken);
  res.cookie(ACCESS_COOKIE, accessToken, { ...base, path: '/', maxAge: exp * 1000 - Date.now() });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...base, path: REFRESH_PATH, maxAge: REFRESH_TTL_MS });
};

export const clearAuthCookies = (res) => {
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_PATH });
};
