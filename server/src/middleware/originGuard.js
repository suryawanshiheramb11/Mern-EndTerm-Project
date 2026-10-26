import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

// Browsers always send Origin on cross-origin requests; anything other than the configured client is refused.
// Requests without an Origin header (server-to-server, curl, tests) are not browser-initiated and pass.
export const originGuard = (req, _res, next) => {
  const origin = req.get('origin');
  if (origin && origin !== env.CLIENT_URL) return next(ApiError.forbidden('Origin not allowed'));
  return next();
};
