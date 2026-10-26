import { z } from 'zod';
import { COMPLAINT_CATEGORIES, COMPLAINT_STATUSES, PRIORITIES, URGENCIES } from '../models/Complaint.js';
import { isAllowedAttachmentUrl } from '../utils/urls.js';
import { objectId, pagination } from './common.js';

const attachmentUrl = z
  .string()
  .url()
  .max(500)
  .refine((u) => isAllowedAttachmentUrl(u), 'Must be an https URL on an allowed host');

const text = (min, max) => z.string().trim().min(min).max(max);

export const createComplaintSchema = z
  .object({
    category: z.enum(COMPLAINT_CATEGORIES),
    title: text(3, 120),
    description: text(3, 2000),
    urgency: z.enum(URGENCIES),
    attachments: z.array(z.object({ url: attachmentUrl, mime: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/).max(100).optional() }).strict()).max(5).optional(),
  })
  .strict(); // property/room/bed/stay/priority/status come from the server, never the body

export const listComplaintsQuery = z
  .object({
    ...pagination,
    propertyId: objectId.optional(),
    status: z.enum(COMPLAINT_STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    category: z.enum(COMPLAINT_CATEGORIES).optional(),
    assignedTo: objectId.optional(),
    overdueOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  })
  .strict();

export const summaryQuery = z.object({ propertyId: objectId.optional() }).strict();
export const assigneesQuery = z.object({ propertyId: objectId }).strict();

export const noteBody = z.object({ note: text(1, 500).optional() }).strict();
export const assignSchema = z.object({ assignedTo: objectId, priority: z.enum(PRIORITIES) }).strict();
export const progressSchema = z.object({ progressNote: text(3, 1000), photoUrl: attachmentUrl.optional() }).strict();
export const resolveSchema = z.object({ resolutionNotes: text(3, 2000), completionPhotoUrl: attachmentUrl.optional() }).strict();
export const reopenSchema = z.object({ reason: text(3, 500) }).strict();
