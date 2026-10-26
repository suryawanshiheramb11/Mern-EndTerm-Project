/*
 * Permissions that can be granted to staff (wardens, maintenance) per property via
 * User.propertyAccess. Owners implicitly hold every permission on the properties they own.
 * Students never hold permissions; they are scoped by ownership of their own records instead.
 */
export const PERMISSIONS = Object.freeze({
  RESIDENTS_VIEW: 'residents.view',
  RESIDENTS_EDIT: 'residents.edit',
  PAYMENTS_RECORD: 'payments.record',
  PAYMENTS_VIEW: 'payments.view',
  COMPLAINTS_MANAGE: 'complaints.manage',
  FINANCES_VIEW: 'finances.view',
  FINANCES_EDIT: 'finances.edit',
  REPORTS_VIEW: 'reports.view',
  SETTINGS_EDIT: 'settings.edit',

  // Earlier phases' names, kept as aliases of the catalog entries above.
  RESIDENTS_WRITE: 'residents.edit',
  STAYS_WRITE: 'residents.edit',
  PAYMENTS_WRITE: 'payments.record',
  // Inventory writes (not in the Phase 8 catalog): satisfied by their own grant or by settings.edit.
  ROOMS_WRITE: 'rooms:write',
  BEDS_WRITE: 'beds:write',
});

export const PERMISSION_CATALOG = Object.freeze([
  'residents.view', 'residents.edit', 'payments.record', 'payments.view', 'complaints.manage',
  'finances.view', 'finances.edit', 'reports.view', 'settings.edit',
]);

// Grants stored by earlier phases are still honoured; new grants use the catalog names.
export const LEGACY_PERMISSIONS = Object.freeze(['residents:write', 'stays:write', 'payments:write', 'rooms:write', 'beds:write']);
export const ALL_ASSIGNABLE = Object.freeze([...PERMISSION_CATALOG, ...LEGACY_PERMISSIONS]);

// required permission -> other grants that also satisfy it
const SATISFIED_BY = Object.freeze({
  'residents.edit': ['residents:write', 'stays:write'],
  'payments.record': ['payments:write'],
  'rooms:write': ['settings.edit'],
  'beds:write': ['settings.edit'],
});

export const grantSatisfies = (granted, required) =>
  granted.includes(required) || (SATISFIED_BY[required] ?? []).some((alt) => granted.includes(alt));

export const DEFAULT_PERMISSIONS = Object.freeze({
  warden: Object.freeze(['residents.view', 'residents.edit', 'payments.record', 'payments.view', 'complaints.manage']),
  maintenance: Object.freeze(['complaints.manage', 'residents.view']),
});
