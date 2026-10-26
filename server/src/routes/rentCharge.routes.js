import { Router } from 'express';
import * as ctrl from '../controllers/rentCharge.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import {
  adjustChargeSchema,
  generateSchema,
  listChargesQuery,
  reconcileSchema,
  updateChargeSchema,
  waiveChargeSchema,
} from '../validators/rentCharge.schema.js';

// Property scope is enforced in the service layer. Maintenance staff have no access to finances.
const router = Router();
const owner = authorize('owner');
const readers = authorize('owner', 'warden', 'student'); // students see only their own

router.use(authenticate);

// Fixed paths first so they are not captured by /:id.
router.post('/generate', owner, validate({ body: generateSchema }), ctrl.generate);
router.post('/reconcile', owner, validate({ body: reconcileSchema }), ctrl.reconcile);
router.get('/', readers, validate({ query: listChargesQuery }), ctrl.list);
router.get('/:id', readers, validate({ params: idParams }), ctrl.get);
router.patch('/:id', owner, validate({ params: idParams, body: updateChargeSchema }), ctrl.update);
router.post('/:id/waive', owner, validate({ params: idParams, body: waiveChargeSchema }), ctrl.waive);
router.post('/:id/adjust', owner, validate({ params: idParams, body: adjustChargeSchema }), ctrl.adjust);

export default router;
