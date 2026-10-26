import { z } from 'zod';
import { objectId, pagination } from './common.js';

export const pageQuery = z.object({ ...pagination }).strict();
export const notificationsQuery = z.object({ ...pagination, unread: z.enum(['true', 'false']).transform((v) => v === 'true').optional() }).strict();
export const paymentIdParams = z.object({ paymentId: objectId });
export const notificationParams = z.object({ id: objectId });
