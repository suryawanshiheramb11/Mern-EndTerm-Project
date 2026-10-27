import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '../ThemeToggle.jsx';
import Glyph from './Glyph.jsx';

// Shared by the public pages. On the landing page anchors are in-page (#features); elsewhere they go to /#features.
export function SiteHeader({ home = false }) {
  const base = home ? '' : '/';
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header className={`glass sticky top-0 z-40 border-b bg-slate-50/80 backdrop-blur-xl transition-shadow ${scrolled ? 'border-slate-200 shadow-card' : 'border-transparent'}`}>
        <nav aria-label="Main" className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" onClick={() => window.scrollTo({ top: 0 })} className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-onaccent"><Glyph name="bed" className="h-4 w-4" /></span>
            StayOS
          </Link>
          <div className="hidden items-center gap-7 text-sm text-slate-600 lg:flex">
            <a href={`${base}#product`} className="hover:text-slate-900">Product</a>
            <a href={`${base}#features`} className="hover:text-slate-900">Features</a>
            <a href={`${base}#roles`} className="hover:text-slate-900">Who it is for</a>
            <a href={`${base}#compare`} className="hover:text-slate-900">Compare</a>
            <a href={`${base}#faq`} className="hover:text-slate-900">FAQ</a>
            <Link to="/pricing" className="hover:text-slate-900">Pricing</Link>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <Link to="/login" className="inline-flex min-h-[44px] items-center px-2 text-sm font-semibold text-accent-ink hover:underline sm:px-3">Log in</Link>
            <Link to="/register" className="inline-flex min-h-[36px] items-center rounded-full bg-accent px-4 text-sm font-semibold text-onaccent hover:bg-accent-hover">Get started</Link>
          </div>
        </nav>
      </header>

  );
}

export function SiteFooter({ home = false }) {
  const base = home ? '' : '/';
  return (
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-sm text-slate-600 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div>
            <p className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900"><span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-onaccent"><Glyph name="bed" className="h-4 w-4" /></span>StayOS</p>
            <p className="mt-3 max-w-xs">Hostel and PG management for owners, wardens, maintenance staff and students.</p>
          </div>
          <div><p className="font-semibold text-slate-900">Product</p><ul className="mt-3 space-y-2"><li><a href={`${base}#product`} className="hover:text-slate-900">Overview</a></li><li><a href={`${base}#features`} className="hover:text-slate-900">Features</a></li><li><a href={`${base}#compare`} className="hover:text-slate-900">Compare</a></li><li><a href={`${base}#faq`} className="hover:text-slate-900">FAQ</a></li><li><Link to="/pricing" className="hover:text-slate-900">Pricing</Link></li></ul></div>
          <div><p className="font-semibold text-slate-900">Who it is for</p><ul className="mt-3 space-y-2"><li>Owners</li><li>Wardens</li><li>Maintenance staff</li><li>Students</li></ul></div>
          <div><p className="font-semibold text-slate-900">Get started</p><ul className="mt-3 space-y-2"><li><Link to="/register" className="hover:text-slate-900">Create an account</Link></li><li><Link to="/login" className="hover:text-slate-900">Log in</Link></li></ul></div>
        </div>
        <div className="border-t border-slate-200 px-4 py-5 text-center text-xs text-slate-500">StayOS. Amounts in ₹, dates in IST.</div>
      </footer>

  );
}
