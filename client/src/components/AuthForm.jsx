import Icon from './Icon.jsx';

export function Field({ label, error, ...props }) {
  return (
    <label className="block text-sm font-medium text-slate-600">
      {label}
      <input
        {...props}
        className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-800 focus:border-accent-ink"
      />
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}

// The sign-in surface: one card, one job. The mark appears once; the title says what the screen is for.
export default function AuthForm({ title, subtitle, error, submitting, submitLabel, onSubmit, footer, children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="mb-6 flex flex-col items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-accent text-onaccent shadow-card"><Icon name="home" size={26} /></span>
        <span className="text-sm font-semibold tracking-tight text-slate-500">StayOS</span>
      </div>
      <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4 p-7">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-slate-800">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {children}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-base font-semibold text-onaccent hover:bg-accent-hover disabled:opacity-60"
        >
          {submitting ? 'Please wait…' : submitLabel}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-500">{footer}</p>
    </div>
  );
}
