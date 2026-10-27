import { NavLink, Outlet } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import NotificationBell from '../components/notifications/NotificationBell.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Four destinations: a bottom tab bar on phones (reachable with one thumb), a top bar on wide screens.
// Notifications live in the bell, so the tab bar stays at four.
const TABS = [
  { to: '/student', label: 'Home', icon: 'home', end: true },
  { to: '/student/rent', label: 'Rent', icon: 'rent' },
  { to: '/student/complaints', label: 'Complaints', icon: 'message' },
  { to: '/student/profile', label: 'Profile', icon: 'user' },
];

export default function StudentShell() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-slate-50 pb-24 md:pb-0">
      <header className="glass sticky top-0 z-30 border-b border-slate-200">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-accent text-onaccent"><Icon name="home" size={18} /></span>
            <span className="text-[17px] font-semibold tracking-tight text-slate-800">StayOS</span>
          </div>
          <nav aria-label="Main" className="hidden gap-1 md:flex">
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-accent-tint text-accent-ink' : 'text-slate-600 hover:bg-slate-100'}`}>{t.label}</NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1 text-sm">
            <NotificationBell to="/student/notifications" />
            <span className="hidden font-medium text-slate-800 lg:inline">{user.name}</span>
            <button type="button" onClick={logout} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100">
              <Icon name="logout" size={18} />
              <span className="hidden sm:inline">Log out</span>
              <span className="sr-only sm:hidden">Log out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-4 md:py-8"><Outlet /></main>

      <nav aria-label="Main" className="glass fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map((t) => (
            <li key={t.to}>
              <NavLink to={t.to} end={t.end} className={({ isActive }) => `flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive ? 'text-accent-ink' : 'text-slate-500'}`}>
                <Icon name={t.icon} size={24} />
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
