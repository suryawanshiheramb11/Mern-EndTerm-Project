import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { csvRow } from '../utils/csv.js';
import * as reports from '../services/report.service.js';
import { assertPropertyAccess } from '../services/propertyAccess.service.js';
import { PERMISSIONS } from '../config/permissions.js';

const VIEW = [PERMISSIONS.FINANCES_VIEW, PERMISSIONS.REPORTS_VIEW];

// Every report is owner-only (route) and re-checked against the property here.
const report = (key, fn) =>
  asyncHandler(async (req, res) => {
    await assertPropertyAccess(req.user, req.query.propertyId, { permission: VIEW });
    ApiResponse.send(res, { [key]: await fn(req.query) });
  });

export const overview = report('overview', (q) => reports.overview(q.propertyId, q.periodKey));
export const collections = report('collections', (q) => reports.collections(q.propertyId, q));
export const outstanding = report('outstanding', (q) => reports.outstanding(q.propertyId));
export const expenses = report('expenses', (q) => reports.expensesReport(q.propertyId, q));
export const trend = report('trend', (q) => reports.trend(q.propertyId, q.months));
export const occupancy = report('occupancy', async (q) => {
  const result = await reports.occupancySeries(q.propertyId, q);
  if (result.error) throw ApiError.badRequest('Validation failed', [{ field: 'query.from', message: result.error }]);
  return result;
});

// Raw rows carry resident names and payment details, so each export also needs the matching read permission.
const EXPORT_PERMISSION = {
  charges: PERMISSIONS.PAYMENTS_VIEW,
  payments: PERMISSIONS.PAYMENTS_VIEW,
  residents: PERMISSIONS.RESIDENTS_VIEW,
  expenses: PERMISSIONS.FINANCES_VIEW,
};

export const exportCsv = asyncHandler(async (req, res) => {
  await assertPropertyAccess(req.user, req.query.propertyId, { permission: VIEW });
  await assertPropertyAccess(req.user, req.query.propertyId, { permission: EXPORT_PERMISSION[req.query.type] });
  const spec = reports.exportSpec(req.query.type, req.query.propertyId, req.query);

  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${spec.filename}"`);
  res.write(csvRow(spec.headers));
  for await (const doc of spec.cursor()) res.write(csvRow(spec.toRow(doc)));
  res.end();
});
