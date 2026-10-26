import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { assertPropertyAccess } from '../services/propertyAccess.service.js';
import { logAudit } from '../services/audit.service.js';
import { notify } from '../services/notification.service.js';
import { propertyParams } from '../validators/common.js';

// Mounted at /properties/:propertyId/announcements. Owner only: a notice to every resident with a login.
const router = Router({ mergeParams: true });

const body = z.object({ title: z.string().trim().min(3).max(120), body: z.string().trim().min(3).max(1000) }).strict();

router.post(
  '/',
  authorize('owner'),
  validate({ params: propertyParams, body }),
  asyncHandler(async (req, res) => {
    await assertPropertyAccess(req.user, req.params.propertyId);
    const announcementId = new mongoose.Types.ObjectId();
    const result = await notify('announcement', { propertyId: req.params.propertyId, title: req.body.title, body: req.body.body, announcementId });
    await logAudit(req, { action: 'announcement.create', entityType: 'Property', entityId: req.params.propertyId, property: req.params.propertyId, meta: { title: req.body.title, recipients: result.created } });
    ApiResponse.created(res, { announcementId: String(announcementId), recipients: result.created }, 'Announcement sent');
  }),
);

export default router;
