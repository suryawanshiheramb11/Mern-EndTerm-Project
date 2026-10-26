import { ApiError } from '../utils/ApiError.js';

/**
 * Validate request parts against Zod schemas and replace them with parsed values.
 * Usage: validate({ body: schema, params: schema, query: schema })
 */
export const validate = (schemas = {}) => (req, _res, next) => {
  const issues = [];

  for (const part of ['body', 'params', 'query']) {
    const schema = schemas[part];
    if (!schema) continue;

    const result = schema.safeParse(req[part]);
    if (!result.success) {
      issues.push(
        ...result.error.issues.map((i) => ({
          field: [part, ...i.path].join('.'),
          message: i.message,
        })),
      );
    } else if (part === 'query') {
      // req.query is a getter in newer Express versions; define instead of assign
      Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
    } else {
      req[part] = result.data;
    }
  }

  if (issues.length) return next(new ApiError(400, 'Validation failed', issues));
  return next();
};

export default validate;
