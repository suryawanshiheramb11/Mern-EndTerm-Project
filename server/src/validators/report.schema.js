import { z } from 'zod';
import { dateOnly, objectId } from './common.js';
import { periodKey } from './rentCharge.schema.js';

const ordered = [(b) => !b.from || !b.to || b.from <= b.to, { path: ['to'], message: 'Must not be before from' }];

export const overviewQuery = z.object({ propertyId: objectId, periodKey: periodKey.optional() }).strict();
export const rangeQuery = z.object({ propertyId: objectId, from: dateOnly.optional(), to: dateOnly.optional() }).strict().refine(...ordered);
export const outstandingQuery = z.object({ propertyId: objectId }).strict();
export const expensesReportQuery = z
  .object({ propertyId: objectId, from: dateOnly.optional(), to: dateOnly.optional(), groupBy: z.enum(['category', 'month']).optional() })
  .strict()
  .refine(...ordered);
export const trendQuery = z.object({ propertyId: objectId, months: z.coerce.number().int().min(1).max(24).default(6) }).strict();
export const exportQuery = z
  .object({ propertyId: objectId, type: z.enum(['charges', 'payments', 'expenses', 'residents']), from: dateOnly.optional(), to: dateOnly.optional() })
  .strict()
  .refine(...ordered);
