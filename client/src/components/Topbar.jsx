import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_HOME } from '../lib/roles.js';
import Icon from './Icon.jsx';
import MobileNav from './MobileNav.jsx';
import NotificationBell from './notifications/NotificationBell.jsx';

export default function Topbar() {
  const { user, logout } = useAuth();
  return (
    <header className="glass sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 px-4 md:px-8">
      <MobileNav />
      <div className="ml-auto flex items-center gap-2 text-sm">
        <NotificationBell to={`${ROLE_HOME[user.role]}/notifications`} />
        <div className="hidden items-center gap-2 pl-2 sm:flex">
          <span className="font-medium text-slate-800">{user.name}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">{user.role}</span>
        </div>
        <button type="button" onClick={logout} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100">
          <Icon name="logout" size={18} />
          <span className="hidden sm:inline">Log out</span>
          <span className="sr-only sm:hidden">Log out</span>
        </button>
      </div>
    </header>
  );
}
