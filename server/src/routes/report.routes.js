import { Router } from 'express';
import * as ctrl from '../controllers/report.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { PERMISSIONS } from '../config/permissions.js';
import { exportQuery, expensesReportQuery, outstandingQuery, overviewQuery, rangeQuery, trendQuery } from '../validators/report.schema.js';

// Owners, and wardens holding finances.view (or reports.view) on the property. Students and
// maintenance staff never reach these.
const router = Router();

router.use(authenticate, authorize('owner', 'warden'), requirePermission([PERMISSIONS.FINANCES_VIEW, PERMISSIONS.REPORTS_VIEW]));

router.get('/overview', validate({ query: overviewQuery }), ctrl.overview);
router.get('/occupancy', validate({ query: rangeQuery }), ctrl.occupancy);
router.get('/collections', validate({ query: rangeQuery }), ctrl.collections);
router.get('/outstanding', validate({ query: outstandingQuery }), ctrl.outstanding);
router.get('/expenses', validate({ query: expensesReportQuery }), ctrl.expenses);
router.get('/trend', validate({ query: trendQuery }), ctrl.trend);
router.get('/export', validate({ query: exportQuery }), ctrl.exportCsv);

export default router;
