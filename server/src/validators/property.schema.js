import { z } from 'zod';
import { PROPERTY_TYPES } from '../models/Property.js';
import { nonEmpty, pagination } from './common.js';

const text = (max) => z.string().trim().min(1).max(max);

const address = z
  .object({
    line1: text(200),
    line2: text(200).optional(),
    city: text(100),
    state: text(100),
    pincode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9 -]{4,10}$/, 'Pincode must be 4–10 characters'),
    country: z.string().trim().length(2).toUpperCase().optional(),
  })
  .strict();

const contact = z
  .object({
    name: text(100),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\-\s()]{7,20}$/, 'Invalid phone number'),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
  })
  .strict();

const settings = z
  .object({
    currency: z.string().trim().length(3).toUpperCase(),
    billingDay: z.number().int().min(1).max(28),
    gracePeriodDays: z.number().int().min(0).max(60),
    lateFeePercent: z.number().min(0).max(100),
  })
  .partial()
  .strict();

const facilities = z
  .array(z.string().trim().toLowerCase().min(1).max(30))
  .max(30)
  .transform((list) => [...new Set(list)]);

const fields = {
  name: z.string().trim().min(2).max(100),
  type: z.enum(PROPERTY_TYPES),
  address,
  contact,
  facilities,
  settings,
};

export const createPropertySchema = z
  .object({ ...fields, type: fields.type.optional(), contact: contact.optional(), facilities: facilities.optional(), settings: settings.optional() })
  .strict();

export const updatePropertySchema = z
  .object({ ...fields, address: address.partial(), contact: contact.partial() })
  .partial()
  .strict()
  .refine(...nonEmpty);

export const listPropertiesQuery = z.object(pagination).strict();
