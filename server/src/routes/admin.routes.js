import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { JOBS, runJob } from '../jobs/index.js';
import { getUserPropertyIds } from '../services/propertyAccess.service.js';
import { logAudit } from '../services/audit.service.js';
import { ApiResponse } from '../utils/ApiResponse.js';

const router = Router();

router.use(authenticate, authorize('owner'));

/*
 * Manual trigger for the daily jobs (demo and tests). Owner only, and always limited to the
 * properties that owner owns, so one tenant can never run a job across another's data.
 */
router.post(
  '/jobs/:name',
  validate({ params: z.object({ name: z.enum(Object.keys(JOBS)) }) }),
  asyncHandler(async (req, res) => {
    const propertyIds = await getUserPropertyIds(req.user);
    const result = await runJob(req.params.name, { propertyIds });
    await logAudit(req, { action: 'job.run', entityType: 'Job', entityId: req.user._id, meta: { job: req.params.name, result } });
    ApiResponse.send(res, { job: req.params.name, result }, 'Job completed');
  }),
);

export default router;
