import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

const normalize = (err) => {
  if (err instanceof ApiError) {
    return { statusCode: err.statusCode, message: err.message, errors: err.errors };
  }

  if (err instanceof ZodError) {
    return {
      statusCode: 400,
      message: 'Validation failed',
      errors: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    };
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return {
      statusCode: 400,
      message: 'Validation failed',
      errors: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    };
  }

  if (err instanceof mongoose.Error.CastError) {
    return { statusCode: 400, message: `Invalid ${err.path}: ${err.value}` };
  }

  if (err?.code === 11000) {
    const fields = Object.keys(err.keyValue ?? {});
    return {
      statusCode: 409,
      message: fields.length ? `Duplicate value for: ${fields.join(', ')}` : 'Duplicate value',
      errors: fields.map((f) => ({ field: f, message: 'Already exists' })),
    };
  }

  // JWT errors (auth is implemented in a later phase; handled here so the shape is stable)
  if (err?.name === 'JsonWebTokenError') return { statusCode: 401, message: 'Invalid token' };
  if (err?.name === 'TokenExpiredError') return { statusCode: 401, message: 'Token expired' };

  if (err?.type === 'entity.parse.failed') return { statusCode: 400, message: 'Malformed JSON body' };
  if (err?.type === 'entity.too.large') return { statusCode: 413, message: 'Payload too large' };

  return { statusCode: 500, message: 'Internal Server Error', unknown: true };
};

export const errorHandler = (err, req, res, _next) => {
  const { statusCode, message, errors, unknown } = normalize(err);

  if (statusCode >= 500 && !(err instanceof ApiError)) logger.error(`${req.method} ${req.originalUrl}`, err);

  const body = { success: false, message };
  if (errors?.length) body.errors = errors;
  if (!env.isProd && unknown) body.stack = err?.stack;

  res.status(statusCode).json(body);
};

export default errorHandler;
