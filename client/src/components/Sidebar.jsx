import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { hasAnyPermission, PERMISSIONS as P } from '../lib/permissions.js';
import { ROLE_HOME } from '../lib/roles.js';

export default function Sidebar() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const home = ROLE_HOME[user.role];

  const isOwner = user.role === 'owner';
  const links = [
    ...(isOwner ? [{ to: home, label: 'Dashboard', active: pathname === home }] : []),
    { to: isOwner ? `${home}/properties` : home, label: 'Properties', active: isOwner ? pathname.startsWith(`${home}/properties`) : pathname === home || pathname.startsWith(`${home}/properties`) },
  ];
  if (hasAnyPermission(user, P.RESIDENTS_VIEW)) {
    links.push({ to: `${home}/residents`, label: 'Residents', active: pathname.startsWith(`${home}/residents`) });
  }
  // Maintenance staff have no access to finances.
  if ((user.role === 'owner' || user.role === 'warden') && hasAnyPermission(user, P.PAYMENTS_VIEW)) {
    links.push({ to: `${home}/rent`, label: 'Rent', active: pathname.startsWith(`${home}/rent`) });
    links.push({ to: `${home}/refunds`, label: 'Refunds', active: pathname.startsWith(`${home}/refunds`) });
  }

  if (user.role !== 'maintenance' && hasAnyPermission(user, P.FINANCES_VIEW)) {
    links.push({ to: `${home}/expenses`, label: 'Expenses', active: pathname.startsWith(`${home}/expenses`) });
  }
  if (user.role !== 'maintenance' && hasAnyPermission(user, P.FINANCES_VIEW, P.REPORTS_VIEW)) {
    links.push({ to: `${home}/reports`, label: 'Reports', active: pathname.startsWith(`${home}/reports`) });
  }
  links.push({ to: `${home}/complaints`, label: user.role === 'maintenance' ? 'My tasks' : 'Complaints', active: pathname.startsWith(`${home}/complaints`) });

  return (
    <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white md:block">
      <div className="px-5 py-4 text-lg font-bold text-slate-800">StayOS</div>
      <nav className="space-y-1 px-3">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={`block rounded-md px-3 py-2 text-sm font-medium ${l.active ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
