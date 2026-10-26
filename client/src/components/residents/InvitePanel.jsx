import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ErrorBanner from '../ErrorBanner.jsx';
import { inviteResident } from '../../services/residents.js';

// `initial` is the invite returned by a check-in that already invited the student.
export default function InvitePanel({ resident, canInvite, initial }) {
  const queryClient = useQueryClient();
  const [invite, setInvite] = useState(initial ?? null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      setInvite(await inviteResident(resident.id));
      await queryClient.invalidateQueries({ queryKey: ['resident', resident.id] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const link = invite?.inviteToken ? `${window.location.origin}/reset-password?token=${invite.inviteToken}` : null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-2 text-sm">
      <ErrorBanner error={error} />
      {link ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="font-medium text-amber-900">Invite created (development: no email is sent)</p>
          <p className="mt-1 break-all font-mono text-xs text-amber-900">{link}</p>
          <button type="button" onClick={copy} className="mt-2 rounded border border-amber-300 px-2 py-1 text-xs font-medium">
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      ) : invite ? (
        <p className="text-emerald-700">Invite sent to {resident.email}.</p>
      ) : resident.userId ? (
        <p className="text-emerald-700">Account created — the student has been invited.</p>
      ) : canInvite && resident.email ? (
        <button type="button" disabled={busy} onClick={send} className="rounded-md border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-60">
          {busy ? 'Inviting…' : 'Invite to create an account'}
        </button>
      ) : (
        <p className="text-slate-500">{resident.email ? 'No account yet.' : 'Add an email address to invite this resident.'}</p>
      )}
    </div>
  );
}
