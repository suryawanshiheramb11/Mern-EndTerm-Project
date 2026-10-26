import { Router } from 'express';
import * as ctrl from '../controllers/room.controller.js';
import { PERMISSIONS } from '../config/permissions.js';
import { authorize } from '../middleware/authorize.js';
import { requirePropertyAccess } from '../middleware/propertyAccess.js';
import { validate } from '../middleware/validate.js';
import { propertyParams, roomParams } from '../validators/common.js';
import { createRoomSchema, listRoomsQuery, updateRoomSchema } from '../validators/room.schema.js';
import bedRoutes from './bed.routes.js';

// Mounted at /properties/:propertyId/rooms
const router = Router({ mergeParams: true });

const readers = authorize('owner', 'warden', 'maintenance');
const writers = authorize('owner', 'warden');
const canWriteRooms = requirePropertyAccess(PERMISSIONS.ROOMS_WRITE);

router.get('/', readers, validate({ params: propertyParams, query: listRoomsQuery }), requirePropertyAccess(), ctrl.list);
router.post('/', writers, validate({ params: propertyParams }), canWriteRooms, validate({ body: createRoomSchema }), ctrl.create);
router.get('/:roomId', readers, validate({ params: roomParams }), requirePropertyAccess(), ctrl.get);
router.patch('/:roomId', writers, validate({ params: roomParams }), canWriteRooms, validate({ body: updateRoomSchema }), ctrl.update);
router.delete('/:roomId', writers, validate({ params: roomParams }), canWriteRooms, ctrl.remove);

router.use('/:roomId/beds', bedRoutes);

export default router;
