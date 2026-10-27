import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { buildNavLinks } from './navLinks.js';
import { NavList, Wordmark } from './Sidebar.jsx';
import Icon from './Icon.jsx';

// Below md the sidebar is hidden, so the same destinations open in a side sheet.
export default function MobileNav() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button type="button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg text-slate-700 hover:bg-slate-100">
        <Icon name="menu" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 animate-fade-in bg-black/30 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Menu" className="h-full w-72 max-w-[85vw] animate-sheet-in border-r border-slate-200 bg-white px-3 shadow-sheet">
            <div className="flex items-center justify-between pr-1">
              <Wordmark />
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"><Icon name="close" /></button>
            </div>
            <NavList links={buildNavLinks(user, pathname)} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
