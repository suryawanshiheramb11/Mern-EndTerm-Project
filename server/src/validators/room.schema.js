import { z } from 'zod';
import { ROOM_STATUSES } from '../models/Room.js';
import { nonEmpty, pagination, rupees } from './common.js';

const fields = {
  number: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{1,10}$/, 'Room number must be 1–10 letters or digits')
    .transform((v) => v.toUpperCase()),
  floor: z.number().int().min(-5).max(100),
  capacity: z.number().int().min(1).max(50),
  defaultMonthlyRent: rupees,
  defaultDeposit: rupees,
  amenities: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(30),
  status: z.enum(ROOM_STATUSES),
};

const { status, ...creatable } = fields;

export const createRoomSchema = z
  .object({ ...creatable, floor: fields.floor.optional(), defaultMonthlyRent: rupees.optional(), defaultDeposit: rupees.optional(), amenities: fields.amenities.optional() })
  .strict();

export const updateRoomSchema = z
  .object({ ...creatable, status })
  .partial()
  .strict()
  .refine(...nonEmpty);

export const listRoomsQuery = z
  .object({ ...pagination, status: fields.status.optional(), floor: z.coerce.number().int().optional() })
  .strict();
