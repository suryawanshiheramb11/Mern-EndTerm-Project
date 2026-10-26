import { Router } from 'express';
import * as ctrl from '../controllers/property.controller.js';
import * as bedCtrl from '../controllers/bed.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { requirePropertyAccess } from '../middleware/propertyAccess.js';
import { validate } from '../middleware/validate.js';
import { propertyParams } from '../validators/common.js';
import { createPropertySchema, listPropertiesQuery, updatePropertySchema } from '../validators/property.schema.js';
import { listBedsQuery } from '../validators/bed.schema.js';
import roomRoutes from './room.routes.js';
import staffRoutes from './staff.routes.js';
import announcementRoutes from './announcement.routes.js';

const router = Router();

const readers = authorize('owner', 'warden', 'maintenance');
const params = validate({ params: propertyParams });

router.use(authenticate);

router.post('/', authorize('owner'), validate({ body: createPropertySchema }), ctrl.create);
router.get('/', readers, validate({ query: listPropertiesQuery }), ctrl.list);

router.get('/:propertyId', readers, params, requirePropertyAccess(), ctrl.get);
router.patch('/:propertyId', authorize('owner'), params, requirePropertyAccess(), validate({ body: updatePropertySchema }), ctrl.update);
router.delete('/:propertyId', authorize('owner'), params, requirePropertyAccess(), ctrl.remove);
router.get('/:propertyId/overview', readers, params, requirePropertyAccess(), ctrl.overview);
router.get('/:propertyId/beds', readers, validate({ params: propertyParams, query: listBedsQuery }), requirePropertyAccess(), bedCtrl.listForProperty);

router.use('/:propertyId/rooms', roomRoutes);
router.use('/:propertyId/staff', staffRoutes);
router.use('/:propertyId/announcements', announcementRoutes);

export default router;
