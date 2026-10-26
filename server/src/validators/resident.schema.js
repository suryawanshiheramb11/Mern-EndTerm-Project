import { z } from 'zod';
import { ID_VERIFICATION_STATUSES, RESIDENT_STATUSES } from '../models/Resident.js';
import { nonEmpty, objectId, pagination } from './common.js';

const phone = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s()]{7,20}$/, 'Invalid phone number');

const emergencyContact = z
  .object({ name: z.string().trim().min(1).max(100), phone })
  .partial()
  .strict();

const idVerification = z
  .object({
    status: z.enum(ID_VERIFICATION_STATUSES),
    reference: z.string().trim().min(1).max(100),
  })
  .partial()
  .strict();

const fields = {
  fullName: z.string().trim().min(2).max(100),
  phone,
  email: z.string().trim().toLowerCase().email().max(254),
  emergencyContact,
  idVerification,
  notes: z.string().trim().max(1000),
};

export const createResidentSchema = z
  .object({
    propertyId: objectId,
    ...fields,
    email: fields.email.optional(),
    emergencyContact: emergencyContact.optional(),
    idVerification: idVerification.optional(),
    notes: fields.notes.optional(),
  })
  .strict();

export const updateResidentSchema = z
  .object({ ...fields, status: z.enum(RESIDENT_STATUSES) })
  .partial()
  .strict()
  .refine(...nonEmpty);

export const listResidentsQuery = z
  .object({
    ...pagination,
    propertyId: objectId.optional(),
    status: z.enum(RESIDENT_STATUSES).optional(),
    q: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
