import { Router } from 'express';
import * as ctrl from '../controllers/expense.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { PERMISSIONS } from '../config/permissions.js';
import { idParams } from '../validators/common.js';
import { createExpenseSchema, listExpensesQuery, updateExpenseSchema, voidExpenseSchema } from '../validators/expense.schema.js';

// Wardens need finances.view to read and finances.edit to record or edit; voiding stays owner-only.
const router = Router();

router.use(authenticate, authorize('owner', 'warden'));

router.post('/', requirePermission(PERMISSIONS.FINANCES_EDIT), validate({ body: createExpenseSchema }), ctrl.create);
router.get('/', requirePermission(PERMISSIONS.FINANCES_VIEW), validate({ query: listExpensesQuery }), ctrl.list);
router.get('/:id', validate({ params: idParams }), ctrl.get);
router.patch('/:id', validate({ params: idParams, body: updateExpenseSchema }), ctrl.update);
router.delete('/:id', authorize('owner'), validate({ params: idParams, body: voidExpenseSchema }), ctrl.remove); // voids; never deletes

export default router;
