import { Router } from 'express';
import * as ctrl from '../controllers/bed.controller.js';
import { PERMISSIONS } from '../config/permissions.js';
import { authorize } from '../middleware/authorize.js';
import { requirePropertyAccess } from '../middleware/propertyAccess.js';
import { validate } from '../middleware/validate.js';
import { bedParams, roomParams } from '../validators/common.js';
import { bulkBedsSchema, createBedSchema, listRoomBedsQuery, updateBedSchema } from '../validators/bed.schema.js';

// Mounted at /properties/:propertyId/rooms/:roomId/beds
const router = Router({ mergeParams: true });

const readers = authorize('owner', 'warden', 'maintenance');
const writers = authorize('owner', 'warden');
const canWriteBeds = requirePropertyAccess(PERMISSIONS.BEDS_WRITE);

router.get('/', readers, validate({ params: roomParams, query: listRoomBedsQuery }), requirePropertyAccess(), ctrl.listForRoom);
router.post('/', writers, validate({ params: roomParams }), canWriteBeds, validate({ body: createBedSchema }), ctrl.create);
router.post('/bulk', writers, validate({ params: roomParams }), canWriteBeds, validate({ body: bulkBedsSchema }), ctrl.createBulk);
router.patch('/:bedId', writers, validate({ params: bedParams }), canWriteBeds, validate({ body: updateBedSchema }), ctrl.update);
router.delete('/:bedId', writers, validate({ params: bedParams }), canWriteBeds, ctrl.remove);

export default router;
