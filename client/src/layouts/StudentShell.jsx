import { NavLink, Outlet } from 'react-router-dom';
import NotificationBell from '../components/notifications/NotificationBell.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const LINKS = [
  { to: '/student', label: 'Dashboard', end: true },
  { to: '/student/rent', label: 'Rent' },
  { to: '/student/complaints', label: 'Complaints' },
  { to: '/student/notifications', label: 'Notifications' },
  { to: '/student/profile', label: 'Profile' },
];

export default function StudentShell() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="text-lg font-bold text-slate-800">StayOS</span>
          <nav className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}>{l.label}</NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <NotificationBell to="/student/notifications" />
            <span className="hidden text-slate-600 sm:inline">{user.name}</span>
            <button type="button" onClick={logout} className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50">Log out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 p-4"><Outlet /></main>
    </div>
  );
}
