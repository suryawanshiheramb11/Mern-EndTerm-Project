import { z } from 'zod';
import { BLOOD_GROUPS, GENDERS, ID_VERIFICATION_STATUSES, RESIDENT_STATUSES } from '../models/Resident.js';
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

const text = (max) => z.string().trim().max(max);

export const guardian = z
  .object({ name: text(100), relation: text(40), phone, email: z.string().trim().toLowerCase().email().max(254), address: text(300) })
  .partial()
  .strict();

export const medical = z
  .object({
    bloodGroup: z.enum(BLOOD_GROUPS),
    conditions: text(500),
    allergies: text(500),
    medications: text(500),
    doctorName: text(100),
    doctorPhone: phone,
    insurance: text(200),
  })
  .partial()
  .strict();

const personal = {
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((d) => d >= '1940-01-01' && d <= new Date().toISOString().slice(0, 10), 'Not a valid date of birth').transform((d) => new Date(`${d}T00:00:00.000Z`)),
  gender: z.enum(GENDERS),
  permanentAddress: text(300),
  institution: text(150),
  guardian,
  medical,
};

const fields = {
  ...personal,
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
    ...Object.fromEntries(Object.entries(personal).map(([k, v]) => [k, v.optional()])),
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

// What a resident may edit about themselves; contact and billing fields stay with staff.
export const selfDetailsSchema = z
  .object({ emergencyContact, dateOfBirth: personal.dateOfBirth, gender: personal.gender, permanentAddress: personal.permanentAddress, institution: personal.institution, guardian, medical })
  .partial()
  .strict()
  .refine(...nonEmpty);

export const accountEmailSchema = z.object({ email: z.string().trim().toLowerCase().email('Invalid email address').max(254) }).strict();

export const credentialsSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Invalid email address').max(254).optional(),
    password: z.string().min(8).max(72).regex(/[A-Za-z]/, 'Needs a letter').regex(/\d/, 'Needs a number').optional(),
  })
  .strict();
