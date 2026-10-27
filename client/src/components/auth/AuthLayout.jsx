import { Link } from 'react-router-dom';
import Glyph from '../site/Glyph.jsx';
import ThemeToggle from '../ThemeToggle.jsx';

const POINTS = [
  'Every bed, rent payment and complaint in one place',
  'Students pay by UPI or card and get a receipt at once',
  'Each person sees only what their role allows',
];

// Shared by sign-in, register and change-password: the landing page's look, form on the left, product on the right.
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-2">
      <div className="flex min-h-screen flex-col px-4 py-5 sm:px-10">
        <header className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-onaccent"><Glyph name="bed" className="h-[18px] w-[18px]" /></span>
            StayOS
          </Link>
          <ThemeToggle />
        </header>
        <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          <h1 className="text-[2rem] font-semibold leading-tight tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-2 text-slate-600">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <p className="mt-6 text-center text-sm text-slate-600">{footer}</p>}
        </main>
      </div>
      <aside className="relative hidden overflow-hidden bg-accent p-12 text-onaccent lg:flex lg:flex-col lg:justify-center" aria-hidden="true">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/10" />
        <div className="relative max-w-md">
          <p className="text-4xl font-semibold leading-tight tracking-tight">Run your PG.<br />Not the paperwork.</p>
          <ul className="mt-8 space-y-4 text-lg text-onaccent/90">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3"><span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/20"><Glyph name="check" className="h-4 w-4" /></span>{p}</li>
            ))}
          </ul>
          <div className="mt-10 grid grid-cols-4 gap-2 rounded-2xl bg-white/10 p-4">
            {'ooaoooroaooomooo'.split('').map((c, i) => (
              <span key={i} className={`grid h-9 place-items-center rounded-lg text-xs font-semibold ${c === 'o' ? 'bg-white text-accent-ink' : c === 'a' ? 'bg-white/25' : c === 'r' ? 'bg-white/50' : 'bg-white/10'}`}>{'ABCD'[i % 4]}</span>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

export function Divider({ children = 'or' }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-500">
      <span className="h-px flex-1 bg-slate-200" />{children}<span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

export function TextField({ label, error, hint, ...props }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input {...props} className="mt-1.5 block min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 focus:border-accent-ink" />
      {hint && !error && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-normal text-red-700">{error}</span>}
    </label>
  );
}

export function PrimaryButton({ busy, children, ...props }) {
  return (
    <button type="submit" disabled={busy} {...props} className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-accent px-6 text-[15px] font-semibold text-onaccent hover:bg-accent-hover disabled:opacity-60">
      {busy ? 'Please wait…' : children}
    </button>
  );
}

export function Alert({ children }) {
  return children ? <p role="alert" className="mb-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{children}</p> : null;
}
