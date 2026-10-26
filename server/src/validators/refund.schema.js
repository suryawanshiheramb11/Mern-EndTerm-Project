import { z } from 'zod';
import { REFUND_METHODS, REFUND_STATUSES } from '../models/Refund.js';
import { businessToday } from '../utils/dates.js';
import { dateOnly, objectId, pagination } from './common.js';

const deduction = z
  .object({
    amountPaise: z.number().int().min(1).max(1_000_000_000),
    reason: z.string().trim().min(3).max(200),
    evidenceRef: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

const checkoutFields = {
  actualCheckOutDate: dateOnly,
  deductions: z.array(deduction).max(20).optional(),
  deductOutstandingRent: z.boolean().optional(),
};

export const previewCheckoutSchema = z.object(checkoutFields).strict();

export const commitCheckoutSchema = z
  .object({
    ...checkoutFields,
    force: z.boolean().optional(),
    forceReason: z.string().trim().min(3).max(300).optional(),
    approveRefundNow: z.boolean().optional(),
    notes: z.string().trim().max(300).optional(),
  })
  .strict();

export const listRefundsQuery = z
  .object({ ...pagination, propertyId: objectId.optional(), residentId: objectId.optional(), status: z.enum(REFUND_STATUSES).optional() })
  .strict();

export const payRefundSchema = z
  .object({
    method: z.enum(REFUND_METHODS),
    reference: z.string().trim().min(1).max(100).optional(),
    paidAt: dateOnly.refine((d) => d <= businessToday(), 'Cannot be in the future').optional(),
  })
  .strict()
  .refine((b) => b.method === 'cash' || b.reference, { path: ['reference'], message: 'Reference is required for UPI and bank refunds' });

export const emptyBody = z.object({}).strict();
