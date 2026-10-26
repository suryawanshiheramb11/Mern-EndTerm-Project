import { Router } from 'express';
import * as ctrl from '../controllers/staff.controller.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { propertyParams } from '../validators/common.js';
import { inviteStaffSchema, staffParams, updateStaffSchema } from '../validators/staff.schema.js';

// Mounted at /properties/:propertyId/staff. Owner only; ownership of the property is checked in the service.
const router = Router({ mergeParams: true });
const owner = authorize('owner');

router.get('/', owner, validate({ params: propertyParams }), ctrl.list);
router.post('/invite', owner, validate({ params: propertyParams, body: inviteStaffSchema }), ctrl.invite);
router.patch('/:userId', owner, validate({ params: staffParams, body: updateStaffSchema }), ctrl.update);
router.delete('/:userId', owner, validate({ params: staffParams }), ctrl.revoke);

export default router;
