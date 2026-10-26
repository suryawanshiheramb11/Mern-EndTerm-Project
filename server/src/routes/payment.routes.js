import { Router } from 'express';
import * as ctrl from '../controllers/payment.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { paymentLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import { PERMISSIONS } from '../config/permissions.js';
import { idParams } from '../validators/common.js';
import { listPaymentsQuery, recordPaymentSchema, reversePaymentSchema } from '../validators/payment.schema.js';

// Wardens need payments.record to record and payments.view to read (checked here and in the service).
const router = Router();
const owner = authorize('owner');
const staff = authorize('owner', 'warden');
const readers = authorize('owner', 'warden', 'student'); // students see only their own, even after check-out

router.use(authenticate);

router.post('/', staff, paymentLimiter, requirePermission(PERMISSIONS.PAYMENTS_RECORD), validate({ body: recordPaymentSchema }), ctrl.record);
router.get('/', readers, validate({ query: listPaymentsQuery }), ctrl.list);
router.get('/:id', readers, validate({ params: idParams }), ctrl.get);
router.get('/:id/receipt', readers, validate({ params: idParams }), ctrl.receipt);
router.post('/:id/reverse', owner, validate({ params: idParams, body: reversePaymentSchema }), ctrl.reverse);
router.post('/:id/verify', owner, validate({ params: idParams }), ctrl.verify);

export default router;
