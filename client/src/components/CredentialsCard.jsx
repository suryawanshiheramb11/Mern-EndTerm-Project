import { useState } from 'react';

// Shown once, right after an owner/warden creates a login or resets a password. The server never stores or
// returns the password again, so this is the only chance to copy it.
export default function CredentialsCard({ email, password, note }) {
  const [copied, setCopied] = useState('');
  const copy = async (what, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      setCopied('');
    }
  };
  const row = (label, value, key) => (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="select-all break-all font-mono text-base text-slate-900">{value}</p>
      </div>
      <button type="button" onClick={() => copy(key, value)} className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100">{copied === key ? 'Copied' : 'Copy'}</button>
    </div>
  );
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      {row('Email (login ID)', email, 'email')}
      {row('Temporary password', password, 'password')}
      <button type="button" onClick={() => copy('both', `Email: ${email}\nTemporary password: ${password}`)} className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-onaccent hover:bg-accent-hover">{copied === 'both' ? 'Copied' : 'Copy both'}</button>
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Shown only once. {note ?? 'They must choose a new password the first time they sign in.'} Share it privately, not in a group chat.
      </p>
    </div>
  );
}
