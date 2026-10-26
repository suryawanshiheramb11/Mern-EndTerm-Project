import { ApiError } from '../utils/ApiError.js';

export const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized('Authentication required'));
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden('Insufficient permissions'));
  return next();
};

// Allows the user addressed by :id themselves, or any of the listed roles.
export const requireSelfOrRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized('Authentication required'));
  if (req.user.id === req.params.id || roles.includes(req.user.role)) return next();
  return next(ApiError.forbidden('Insufficient permissions'));
};

export default authorize;
