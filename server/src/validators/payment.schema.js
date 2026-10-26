import { z } from 'zod';
import { PAYMENT_METHODS } from '../models/Payment.js';
import { businessToday } from '../utils/dates.js';
import { dateOnly, objectId, pagination } from './common.js';

const positivePaise = z.number().int().min(1).max(1_000_000_000);

// A date-only value means "that day" (today is allowed even though UTC midnight may lie ahead of
// the server clock); a full timestamp must not be in the future.
const paidAt = z.union([
  dateOnly.refine((d) => d <= businessToday(), 'Cannot be in the future').transform((d) => (d.getTime() === businessToday().getTime() ? new Date() : d)),
  z
    .string()
    .datetime({ offset: true })
    .transform((s) => new Date(s))
    .refine((d) => d.getTime() <= Date.now() + 60_000, 'Cannot be in the future'),
]);

// .strict(): a client-supplied receiptNumber, status or verification flag is a 400, not ignored.
export const recordPaymentSchema = z
  .object({
    propertyId: objectId,
    residentId: objectId,
    amountPaise: positivePaise,
    method: z.enum(PAYMENT_METHODS),
    reference: z.string().trim().min(1).max(100).optional(),
    paidAt: paidAt.optional(),
    allocations: z.array(z.object({ chargeId: objectId, amountPaise: positivePaise }).strict()).max(100).optional(),
    allowAdvance: z.boolean().optional(),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,100}$/, '8-100 characters: letters, digits, _ . : -').optional(),
    notes: z.string().trim().max(300).optional(),
    dryRun: z.boolean().optional(),
  })
  .strict();

export const listPaymentsQuery = z
  .object({
    ...pagination,
    propertyId: objectId.optional(),
    residentId: objectId.optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    method: z.enum(PAYMENT_METHODS).optional(),
  })
  .strict();

export const reversePaymentSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();
