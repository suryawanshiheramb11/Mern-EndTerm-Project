import { asyncHandler } from './asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ACCESS_COOKIE } from '../utils/cookies.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { User } from '../models/User.js';

const extractToken = (req) => {
  const bearer = req.headers.authorization;
  return req.cookies?.[ACCESS_COOKIE] ?? (bearer?.startsWith('Bearer ') ? bearer.slice(7) : undefined);
};

export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required');

  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Authentication required');
  if (user.status !== 'active') throw ApiError.forbidden(`Account is ${user.status}`);

  req.user = user;
  next();
});

export default authenticate;
