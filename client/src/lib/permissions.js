// Mirrors server/src/config/permissions.js; the server remains the authority.
export const PERMISSIONS = {
  RESIDENTS_VIEW: 'residents.view',
  RESIDENTS_EDIT: 'residents.edit',
  PAYMENTS_RECORD: 'payments.record',
  PAYMENTS_VIEW: 'payments.view',
  COMPLAINTS_MANAGE: 'complaints.manage',
  FINANCES_VIEW: 'finances.view',
  FINANCES_EDIT: 'finances.edit',
  REPORTS_VIEW: 'reports.view',
  SETTINGS_EDIT: 'settings.edit',
  // Names used by earlier screens.
  RESIDENTS_WRITE: 'residents.edit',
  STAYS_WRITE: 'residents.edit',
  PAYMENTS_WRITE: 'payments.record',
  ROOMS_WRITE: 'rooms:write',
  BEDS_WRITE: 'beds:write',
};

export const PERMISSION_OPTIONS = [
  { value: 'residents.view', label: 'View residents', hint: 'Residents list and stays' },
  { value: 'residents.edit', label: 'Edit residents', hint: 'Add residents, check in, transfer, check out' },
  { value: 'payments.record', label: 'Record payments', hint: 'Take rent payments' },
  { value: 'payments.view', label: 'View payments', hint: 'Charges, payments, refunds, balances' },
  { value: 'complaints.manage', label: 'Manage complaints', hint: 'Acknowledge, assign, close' },
  { value: 'finances.view', label: 'View finances', hint: 'Reports and expenses (read)' },
  { value: 'finances.edit', label: 'Edit finances', hint: 'Record and edit expenses' },
  { value: 'reports.view', label: 'View reports', hint: 'Reports only' },
  { value: 'settings.edit', label: 'Edit settings', hint: 'Rooms and beds' },
];

export const DEFAULT_PERMISSIONS = {
  warden: ['residents.view', 'residents.edit', 'payments.record', 'payments.view', 'complaints.manage'],
  maintenance: ['complaints.manage'],
};

const SATISFIED_BY = {
  'residents.edit': ['residents:write', 'stays:write'],
  'payments.record': ['payments:write'],
  'rooms:write': ['settings.edit'],
  'beds:write': ['settings.edit'],
};

export const hasPermission = (user, propertyId, permission) => {
  if (user.role === 'owner') return true;
  if (user.role !== 'warden' && user.role !== 'maintenance') return false;
  const granted = user.propertyAccess.find((a) => a.property === propertyId)?.permissions ?? [];
  return granted.includes(permission) || (SATISFIED_BY[permission] ?? []).some((alt) => granted.includes(alt));
};

export const canWrite = hasPermission;

// True when the user holds the permission (any of the given ones) at any of their properties.
export const hasAnyPermission = (user, ...permissions) => {
  if (user.role === 'owner') return true;
  if (user.role !== 'warden' && user.role !== 'maintenance') return false;
  return (user.propertyAccess ?? []).some((a) => permissions.some((p) => hasPermission(user, a.property, p)));
};
