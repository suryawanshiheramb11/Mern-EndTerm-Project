import { Router } from 'express';
import * as ctrl from '../controllers/complaint.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import {
  assigneesQuery, assignSchema, createComplaintSchema, listComplaintsQuery, noteBody,
  progressSchema, reopenSchema, resolveSchema, summaryQuery,
} from '../validators/complaint.schema.js';

/*
 * Role gates here are the coarse layer; the service enforces ownership (students: own complaints),
 * property scope, maintenance-only-assigned, and the state machine.
 */
const router = Router();
const staff = authorize('owner', 'warden');
const everyone = authorize('owner', 'warden', 'maintenance', 'student');
const fieldWorkers = authorize('owner', 'warden', 'maintenance');
const id = { params: idParams };

router.use(authenticate);

router.post('/', authorize('student'), validate({ body: createComplaintSchema }), ctrl.create);
router.get('/', everyone, validate({ query: listComplaintsQuery }), ctrl.list);
// Fixed paths before /:id.
router.get('/summary', staff, validate({ query: summaryQuery }), ctrl.summary);
router.get('/assignees', staff, validate({ query: assigneesQuery }), ctrl.assignees);
router.get('/:id', everyone, validate(id), ctrl.get);

router.post('/:id/reopen', authorize('student', 'owner', 'warden'), validate({ ...id, body: reopenSchema }), ctrl.reopen);
router.patch('/:id/reopen', staff, validate({ ...id, body: reopenSchema }), ctrl.reopen);
router.patch('/:id/acknowledge', staff, validate({ ...id, body: noteBody }), ctrl.acknowledge);
router.patch('/:id/assign', staff, validate({ ...id, body: assignSchema }), ctrl.assign);
router.patch('/:id/progress', fieldWorkers, validate({ ...id, body: progressSchema }), ctrl.progress);
router.patch('/:id/resolve', fieldWorkers, validate({ ...id, body: resolveSchema }), ctrl.resolve);
router.patch('/:id/close', staff, validate({ ...id, body: noteBody }), ctrl.close);

export default router;
