import { z } from 'zod';
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_STATUSES } from '../models/Expense.js';
import { businessToday } from '../utils/dates.js';
import { isAllowedAttachmentUrl } from '../utils/urls.js';
import { dateOnly, nonEmpty, objectId, pagination } from './common.js';

const fields = {
  category: z.enum(EXPENSE_CATEGORIES),
  amountPaise: z.number().int().min(1).max(1_000_000_000_0), // floats are rejected, not rounded
  paidAt: dateOnly,
  description: z.string().trim().min(2).max(500),
  vendor: z.string().trim().min(1).max(120),
  paymentStatus: z.enum(EXPENSE_PAYMENT_STATUSES),
  receiptUrl: z.string().url().max(500).refine((u) => isAllowedAttachmentUrl(u), 'Must be an https URL on an allowed host'),
  notes: z.string().trim().max(500),
};

// Something marked paid cannot be dated in the future.
const noFuturePaid = (b, ctx) => {
  if ((b.paymentStatus ?? 'paid') === 'paid' && b.paidAt && b.paidAt > businessToday()) {
    ctx.addIssue({ code: 'custom', path: ['paidAt'], message: 'A paid expense cannot be dated in the future' });
  }
};

export const createExpenseSchema = z
  .object({
    propertyId: objectId,
    category: fields.category,
    amountPaise: fields.amountPaise,
    paidAt: fields.paidAt,
    description: fields.description,
    vendor: fields.vendor.optional(),
    paymentStatus: fields.paymentStatus.optional(),
    receiptUrl: fields.receiptUrl.optional(),
    notes: fields.notes.optional(),
  })
  .strict()
  .superRefine(noFuturePaid);

export const updateExpenseSchema = z
  .object({
    category: fields.category.optional(),
    amountPaise: fields.amountPaise.optional(),
    paidAt: fields.paidAt.optional(),
    description: fields.description.optional(),
    vendor: fields.vendor.optional(),
    paymentStatus: fields.paymentStatus.optional(),
    receiptUrl: fields.receiptUrl.optional(),
    notes: fields.notes.optional(),
  })
  .strict()
  .refine(...nonEmpty);

export const voidExpenseSchema = z.object({ reason: z.string().trim().min(3).max(300).optional() }).strict();

export const listExpensesQuery = z
  .object({
    ...pagination,
    propertyId: objectId.optional(),
    category: z.enum(EXPENSE_CATEGORIES).optional(),
    paymentStatus: z.enum(EXPENSE_PAYMENT_STATUSES).optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    includeVoided: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  })
  .strict();
