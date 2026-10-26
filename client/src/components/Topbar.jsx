import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_HOME } from '../lib/roles.js';
import NotificationBell from './notifications/NotificationBell.jsx';

export default function Topbar() {
  const { user, logout } = useAuth();
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <span className="font-bold text-slate-800 md:hidden">StayOS</span>
      <div className="ml-auto flex items-center gap-3 text-sm">
        <NotificationBell to={`${ROLE_HOME[user.role]}/notifications`} />
        <span className="text-slate-600">
          {user.name} <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs capitalize">{user.role}</span>
        </span>
        <button type="button" onClick={logout} className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
          Log out
        </button>
      </div>
    </header>
  );
}
