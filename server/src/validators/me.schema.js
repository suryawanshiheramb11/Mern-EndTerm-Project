import { z } from 'zod';
import { objectId, pagination } from './common.js';

export const pageQuery = z.object({ ...pagination }).strict();
export const notificationsQuery = z.object({ ...pagination, unread: z.enum(['true', 'false']).transform((v) => v === 'true').optional() }).strict();
export const paymentIdParams = z.object({ paymentId: objectId });
export const notificationParams = z.object({ id: objectId });

export { selfDetailsSchema } from './resident.schema.js';

export const razorpayOrderSchema = z.object({ chargeId: objectId, amountPaise: z.number().int().min(100).max(1_000_000_000).optional() }).strict();
export const razorpayVerifySchema = z
  .object({
    razorpay_order_id: z.string().min(5).max(64),
    razorpay_payment_id: z.string().min(5).max(64),
    razorpay_signature: z.string().min(16).max(128),
  })
  .strict();
