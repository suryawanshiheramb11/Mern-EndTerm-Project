import { z } from 'zod';
import { BED_STATUSES } from '../models/Bed.js';
import { objectId, nonEmpty, pagination, rupees } from './common.js';

const label = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{1,5}$/, 'Bed label must be 1–5 letters or digits')
  .transform((v) => v.toUpperCase());

const notes = z.string().trim().max(500);

// 'occupied' is deliberately absent: only the Phase 3 stay flows may set it.
const manualStatus = z.enum(['available', 'reserved', 'maintenance', 'inactive']);

export const createBedSchema = z
  .object({ label, monthlyRent: rupees.optional(), notes: notes.optional() })
  .strict();

export const updateBedSchema = z
  .object({ label, monthlyRent: rupees.nullable(), status: manualStatus, notes })
  .partial()
  .strict()
  .refine(...nonEmpty);

export const bulkBedsSchema = z
  .object({ count: z.number().int().min(1).max(100), labels: z.array(label).optional(), monthlyRent: rupees.optional() })
  .strict()
  .superRefine((body, ctx) => {
    if (!body.labels) return;
    if (body.labels.length !== body.count) {
      ctx.addIssue({ code: 'custom', path: ['labels'], message: 'labels length must equal count' });
    } else if (new Set(body.labels).size !== body.labels.length) {
      ctx.addIssue({ code: 'custom', path: ['labels'], message: 'labels must be unique' });
    }
  });

export const listBedsQuery = z
  .object({
    ...pagination,
    roomId: objectId.optional(),
    status: z.enum(BED_STATUSES).optional(),
  })
  .strict();

export const listRoomBedsQuery = z
  .object({ ...pagination, status: listBedsQuery.shape.status })
  .strict();
