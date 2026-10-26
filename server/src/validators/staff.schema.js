import { z } from 'zod';
import { PERMISSION_CATALOG } from '../config/permissions.js';
import { nonEmpty, objectId } from './common.js';

const permissions = z.array(z.enum(PERMISSION_CATALOG)).max(PERMISSION_CATALOG.length).transform((list) => [...new Set(list)]);
const role = z.enum(['warden', 'maintenance']); // students are invited through residents, never here

export const inviteStaffSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Invalid email address').max(254),
    name: z.string().trim().min(2).max(80),
    role,
    permissions: permissions.optional(),
  })
  .strict();

export const updateStaffSchema = z.object({ role: role.optional(), permissions: permissions.optional() }).strict().refine(...nonEmpty);

export const staffParams = z.object({ propertyId: objectId, userId: objectId });
