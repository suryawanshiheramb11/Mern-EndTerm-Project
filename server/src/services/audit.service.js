import { AuditLog } from '../models/AuditLog.js';
import { currentContext } from '../middleware/requestContext.js';

/**
 * Appends an audit row (action like 'payment.record', entityType, entityId, before/after, meta).
 * The caller's ip and user agent are picked up from the request context. Call it as the last
 * write of an operation so it never needs rolling back. `entity` is accepted as an alias of
 * `entityType` for older call sites.
 */
export const writeAudit = async ({ user, action, entity, entityType, entityId, property, before, after, meta }, session) => {
  const { ip, userAgent } = currentContext();
  await AuditLog.create(
    [{ user: user?._id ?? user, action, entityType: entityType ?? entity, entityId, property, before, after, meta, ip, userAgent }],
    { session },
  );
};

/** Controller-side form: logAudit(req, { action, entityType, entityId, ... }). */
export const logAudit = (req, entry, session) => writeAudit({ user: req.user, ...entry }, session);
