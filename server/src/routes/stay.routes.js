import { Router } from 'express';
import * as ctrl from '../controllers/stay.controller.js';
import * as refundCtrl from '../controllers/refund.controller.js';
import { commitCheckoutSchema, previewCheckoutSchema } from '../validators/refund.schema.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import { createStaySchema, listStaysQuery, transferStaySchema } from '../validators/stay.schema.js';

// Stays carry rent and deposit terms, so maintenance staff have no access.
const router = Router();

const staff = authorize('owner', 'warden');

router.use(authenticate, staff);

router.post('/', validate({ body: createStaySchema }), ctrl.create);
router.get('/', validate({ query: listStaysQuery }), ctrl.list);
router.get('/:id', validate({ params: idParams }), ctrl.get);
router.post('/:id/transfer', validate({ params: idParams, body: transferStaySchema }), ctrl.transfer);
router.post('/:id/checkout/preview', validate({ params: idParams, body: previewCheckoutSchema }), refundCtrl.preview);
router.post('/:id/checkout', validate({ params: idParams, body: commitCheckoutSchema }), refundCtrl.commit);

export default router;
