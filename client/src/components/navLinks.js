import { hasAnyPermission, PERMISSIONS as P } from '../lib/permissions.js';
import { ROLE_HOME } from '../lib/roles.js';

// One source for the sidebar and the mobile menu, so both always show the same destinations.
export const buildNavLinks = (user, pathname) => {
  const home = ROLE_HOME[user.role];
  const isOwner = user.role === 'owner';
  const starts = (path) => pathname.startsWith(path);
  const links = [];
  if (isOwner) links.push({ to: home, label: 'Dashboard', icon: 'dashboard', active: pathname === home });
  links.push({
    to: isOwner ? `${home}/properties` : home,
    label: 'Properties',
    icon: 'building',
    active: isOwner ? starts(`${home}/properties`) : pathname === home || starts(`${home}/properties`),
  });
  if (hasAnyPermission(user, P.RESIDENTS_VIEW)) links.push({ to: `${home}/residents`, label: 'Residents', icon: 'users', active: starts(`${home}/residents`) });
  // Maintenance staff have no access to finances.
  if ((isOwner || user.role === 'warden') && hasAnyPermission(user, P.PAYMENTS_VIEW)) {
    links.push({ to: `${home}/rent`, label: 'Rent', icon: 'rent', active: starts(`${home}/rent`) });
    links.push({ to: `${home}/refunds`, label: 'Refunds', icon: 'refund', active: starts(`${home}/refunds`) });
  }
  if (user.role !== 'maintenance' && hasAnyPermission(user, P.FINANCES_VIEW)) links.push({ to: `${home}/expenses`, label: 'Expenses', icon: 'receipt', active: starts(`${home}/expenses`) });
  if (user.role !== 'maintenance' && hasAnyPermission(user, P.FINANCES_VIEW, P.REPORTS_VIEW)) links.push({ to: `${home}/reports`, label: 'Reports', icon: 'chart', active: starts(`${home}/reports`) });
  links.push({ to: `${home}/complaints`, label: user.role === 'maintenance' ? 'My tasks' : 'Complaints', icon: 'message', active: starts(`${home}/complaints`) });
  return links;
};
