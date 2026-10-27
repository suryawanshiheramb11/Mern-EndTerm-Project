// Defence in depth for anything that reaches Mongo: Zod schemas remain the primary validation.
//  - keys starting with '$' or containing '.' are dropped (operator / path injection);
//  - control characters are stripped from strings (newlines and tabs are kept for free text).
// Secrets (passwords, one-time tokens) keep their exact characters so they are never altered.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const VERBATIM_KEYS = new Set(['password', 'token', 'newPassword', 'currentPassword', 'credential', 'code']);

const clean = (value, key) => {
  if (typeof value === 'string') return VERBATIM_KEYS.has(key) ? value : value.replace(CONTROL, '');
  if (Array.isArray(value)) return value.map((v) => clean(v, key));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$') || k.includes('.')) continue;
      out[k] = clean(v, k);
    }
    return out;
  }
  return value;
};

export const sanitizeInput = (req, _res, next) => {
  if (req.body) req.body = clean(req.body);
  Object.defineProperty(req, 'query', { value: clean(req.query), writable: true, configurable: true });
  next();
};

export const sanitizeValue = (value) => clean(value);
