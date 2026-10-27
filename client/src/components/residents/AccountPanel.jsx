import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import CredentialsCard from '../CredentialsCard.jsx';
import ErrorBanner from '../ErrorBanner.jsx';
import Modal from '../Modal.jsx';
import ModalForm from '../ModalForm.jsx';
import { Field } from '../AuthForm.jsx';
import { changeResidentEmail, setResidentCredentials } from '../../services/residents.js';

// The student's login: create it with a password you hand over, reset it, or change the email they sign in with.
export default function AccountPanel({ resident, canEdit }) {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null);
  const [result, setResult] = useState(null);
  const [email, setEmail] = useState(resident.email ?? '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['resident', resident.id] });
  const has = Boolean(resident.userId);

  const issue = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await setResidentCredentials(resident.id, has ? {} : { email }));
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const close = () => { setModal(null); setResult(null); setError(null); };

  if (!canEdit) return null;
  return (
    <div className="space-y-2 border-t border-slate-100 pt-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Student login</p>
      <p className="text-slate-700">{has ? `Signs in as ${resident.email}.` : 'No login yet.'}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setModal('credentials')} className="rounded-md border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50">{has ? 'Reset password' : 'Create login with password'}</button>
        {has && <button type="button" onClick={() => setModal('email')} className="rounded-md border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50">Change email</button>}
      </div>
      {modal === 'credentials' && (
        <Modal title={has ? 'Reset student password' : 'Create student login'} onClose={close}>
          <ErrorBanner error={error} />
          {result ? (
            <>
              <CredentialsCard email={result.user.email} password={result.temporaryPassword} />
              <div className="mt-4 flex justify-end"><button type="button" onClick={close} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent">Done</button></div>
            </>
          ) : (
            <div className="space-y-4">
              {has ? (
                <p className="text-sm text-slate-700">This signs {resident.fullName} out everywhere and gives you a new temporary password to pass on.</p>
              ) : (
                <Field label="Email (their login ID)" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={close} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">Cancel</button>
                <button type="button" disabled={busy || (!has && !email)} onClick={issue} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-hover disabled:opacity-60">{busy ? 'Working…' : has ? 'Reset password' : 'Create login'}</button>
              </div>
            </div>
          )}
        </Modal>
      )}
      {modal === 'email' && (
        <ModalForm title="Change student email" onClose={close} submitLabel="Change email" onSubmit={async () => { await changeResidentEmail(resident.id, email); await refresh(); }}>
          <Field label="New email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <p className="text-xs text-slate-500">They are signed out everywhere and use the new address to sign in. Their password stays the same.</p>
        </ModalForm>
      )}
    </div>
  );
}
