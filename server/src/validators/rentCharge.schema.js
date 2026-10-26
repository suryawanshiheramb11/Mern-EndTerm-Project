import { z } from 'zod';
import { CHARGE_STATUSES, PERIOD_KEY_RE } from '../models/RentCharge.js';
import { dateOnly, nonEmpty, objectId, pagination, paise } from './common.js';

export const periodKey = z.string().regex(PERIOD_KEY_RE, 'Use the format YYYY-MM');

// Integer paise only: z.number().int() rejects 12.5, NaN and Infinity instead of rounding them.
const signedPaise = z.number().int().min(-1_000_000_000).max(1_000_000_000);

export const generateSchema = z
  .object({
    propertyId: objectId.optional(),
    stayId: objectId.optional(),
    periodKey,
    dryRun: z.boolean().optional(),
  })
  .strict()
  .refine((b) => Boolean(b.propertyId) !== Boolean(b.stayId), 'Provide exactly one of propertyId or stayId');

export const reconcileSchema = z.object({ propertyId: objectId.optional() }).strict();

export const listChargesQuery = z
  .object({
    ...pagination,
    propertyId: objectId.optional(),
    status: z.enum(CHARGE_STATUSES).optional(),
    periodKey: periodKey.optional(),
    residentId: objectId.optional(),
  })
  .strict();

// Status is deliberately absent: it is computed (waiving has its own action).
export const updateChargeSchema = z
  .object({
    discountPaise: paise.optional(),
    dueDate: dateOnly.optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine(...nonEmpty);

export const adjustChargeSchema = z
  .object({
    amountPaise: signedPaise.refine((v) => v !== 0, 'Adjustment cannot be zero'),
    reason: z.string().trim().min(3).max(300),
  })
  .strict();

export const waiveChargeSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();
