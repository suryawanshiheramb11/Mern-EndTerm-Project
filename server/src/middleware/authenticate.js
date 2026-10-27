import { asyncHandler } from './asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ACCESS_COOKIE } from '../utils/cookies.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { User } from '../models/User.js';

const extractToken = (req) => {
  const bearer = req.headers.authorization;
  return req.cookies?.[ACCESS_COOKIE] ?? (bearer?.startsWith('Bearer ') ? bearer.slice(7) : undefined);
};

// While a temporary password is in force, only these calls work (so the person can change it).
const ALLOWED_WITH_TEMP_PASSWORD = [/^\/api\/auth\/(me|change-password|logout|refresh)$/];

export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required');

  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Authentication required');
  if (user.status !== 'active') throw ApiError.forbidden(`Account is ${user.status}`);

  // Tokens issued before the last password/email change carry an older version and are dead.
  if ((payload.v ?? 0) !== (user.tokenVersion ?? 0)) throw ApiError.unauthorized('Session expired');

  if (user.mustChangePassword && !ALLOWED_WITH_TEMP_PASSWORD.some((re) => re.test(req.baseUrl + req.path))) {
    const err = ApiError.forbidden('You must change your temporary password first');
    err.code = 'PASSWORD_CHANGE_REQUIRED';
    throw err;
  }

  req.user = user;
  next();
});

export default authenticate;
