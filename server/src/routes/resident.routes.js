import { Router } from 'express';
import * as ctrl from '../controllers/resident.controller.js';
import { residentBalance } from '../controllers/payment.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import { createResidentSchema, listResidentsQuery, updateResidentSchema } from '../validators/resident.schema.js';

// Property scope is enforced in the service layer (assertPropertyAccess via loadInScope).
const router = Router();

const readers = authorize('owner', 'warden', 'maintenance');
const writers = authorize('owner', 'warden');

router.use(authenticate);

router.post('/', writers, validate({ body: createResidentSchema }), ctrl.create);
router.get('/', readers, validate({ query: listResidentsQuery }), ctrl.list);
router.get('/:id', readers, validate({ params: idParams }), ctrl.get);
router.patch('/:id', writers, validate({ params: idParams, body: updateResidentSchema }), ctrl.update);
router.get('/:id/balance', authorize('owner', 'warden', 'student'), validate({ params: idParams }), residentBalance);
router.post('/:id/invite', writers, validate({ params: idParams }), ctrl.invite);

export default router;
