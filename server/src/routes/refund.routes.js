import { Router } from 'express';
import * as ctrl from '../controllers/refund.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import { emptyBody, listRefundsQuery, payRefundSchema } from '../validators/refund.schema.js';

// Reads are scoped in the service (staff by property, students to their own refunds).
const router = Router();
const owner = authorize('owner');

router.use(authenticate);

router.get('/', authorize('owner', 'warden', 'student'), validate({ query: listRefundsQuery }), ctrl.list);
router.get('/:id', authorize('owner', 'warden', 'student'), validate({ params: idParams }), ctrl.get);
router.post('/:id/approve', owner, validate({ params: idParams, body: emptyBody }), ctrl.approve);
router.post('/:id/pay', owner, validate({ params: idParams, body: payRefundSchema }), ctrl.pay);
router.post('/:id/cancel', owner, validate({ params: idParams, body: emptyBody }), ctrl.cancel);

export default router;
