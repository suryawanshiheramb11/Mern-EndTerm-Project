import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { buildNavLinks } from './navLinks.js';
import Icon from './Icon.jsx';

export function NavList({ links, onNavigate }) {
  return (
    <nav aria-label="Main" className="space-y-0.5">
      {links.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          onClick={onNavigate}
          aria-current={l.active ? 'page' : undefined}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-medium ${l.active ? 'bg-accent-tint text-accent-ink' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          <Icon name={l.icon} />
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5 px-3 py-4">
      <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-accent text-onaccent"><Icon name="home" size={18} /></span>
      <span className="text-[17px] font-semibold tracking-tight text-slate-800">StayOS</span>
    </div>
  );
}

export default function Sidebar() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 md:flex">
      <Wordmark />
      <NavList links={buildNavLinks(user, pathname)} />
    </aside>
  );
}
