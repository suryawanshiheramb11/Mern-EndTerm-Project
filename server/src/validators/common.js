import { z } from 'zod';
import { toPaise } from '../utils/money.js';

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

// Accepts rupees (max 2 decimals) and yields integer paise.
export const rupees = z
  .number()
  .finite()
  .min(0)
  .max(10_000_000)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'At most 2 decimal places')
  .transform(toPaise);

export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
};

export const nonEmpty = [(obj) => Object.keys(obj).length > 0, 'No fields to update'];

// passthrough: nested routers validate their own ids without stripping the parents'.
export const propertyParams = z.object({ propertyId: objectId }).passthrough();
export const roomParams = z.object({ propertyId: objectId, roomId: objectId }).passthrough();
export const bedParams = z.object({ propertyId: objectId, roomId: objectId, bedId: objectId }).passthrough();

// Date-only strings (YYYY-MM-DD) become UTC-midnight Dates.
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s); // refines still run after a failed regex
  }, 'Invalid date')
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

// Integer paise, sent as-is (field names carry the unit, e.g. monthlyRentPaise).
export const paise = z.number().int().min(0).max(1_000_000_000);

export const idParams = z.object({ id: objectId }).passthrough();
