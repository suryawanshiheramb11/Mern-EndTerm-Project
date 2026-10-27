import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ErrorBanner from '../ErrorBanner.jsx';
import Modal from '../Modal.jsx';
import ModalForm from '../ModalForm.jsx';
import { Field } from '../AuthForm.jsx';
import SelectField from '../SelectField.jsx';
import { DEFAULT_PERMISSIONS, PERMISSION_OPTIONS } from '../../lib/permissions.js';
import CredentialsCard from '../CredentialsCard.jsx';
import { createStaffLogin, inviteStaff, resetStaffPassword, sendAnnouncement, updateStaff } from '../../services/staff.js';

const ROLES = [{ value: 'warden', label: 'Warden' }, { value: 'maintenance', label: 'Maintenance' }];

function PermissionBoxes({ value, onChange }) {
  const toggle = (perm) => onChange(value.includes(perm) ? value.filter((p) => p !== perm) : [...value, perm]);
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium text-slate-700">Permissions</legend>
      {PERMISSION_OPTIONS.map((o) => (
        <label key={o.value} className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-1" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
          <span>{o.label} <span className="text-xs text-slate-400">· {o.hint}</span></span>
        </label>
      ))}
      <p className="text-xs text-slate-500">The server enforces these on every request. Voiding expenses, generating charges and managing staff stay owner-only.</p>
    </fieldset>
  );
}

export function InviteStaffModal({ propertyId, onClose }) {
  const queryClient = useQueryClient();
  const [f, setF] = useState({ name: '', email: '', role: 'warden' });
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS.warden);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.value }));
  const setRole = (e) => {
    setF((prev) => ({ ...prev, role: e.target.value }));
    setPermissions(DEFAULT_PERMISSIONS[e.target.value]);
  };

  // Not ModalForm: after sending, this modal stays open to show the one-time invite link.
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await inviteStaff(propertyId, { ...f, permissions }));
      await queryClient.invalidateQueries({ queryKey: ['staff', propertyId] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const link = result.inviteToken ? `${window.location.origin}/reset-password?token=${result.inviteToken}` : null;
    return (
      <Modal title="Invite sent" onClose={onClose}>
        <p className="text-sm text-slate-700">{result.user.name} was invited as {result.user.role}. They set their password from the invite email.</p>
        {link && (
          <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
            Development only (no email provider): share this one-time link manually.
            <input readOnly value={link} onFocus={(e) => e.target.select()} className="mt-2 w-full rounded border border-amber-300 bg-white px-2 py-1 font-mono" />
          </div>
        )}
        <div className="mt-4 flex justify-end"><button type="button" onClick={onClose} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-onaccent">Done</button></div>
      </Modal>
    );
  }

  return (
    <Modal title="Invite staff" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner error={error} />
        <Field label="Name" required minLength={2} maxLength={80} value={f.name} onChange={set('name')} />
        <Field label="Email" type="email" required value={f.email} onChange={set('email')} />
        <SelectField label="Role" options={ROLES} value={f.role} onChange={setRole} />
        <PermissionBoxes value={permissions} onChange={setPermissions} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-2 text-sm">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-onaccent hover:bg-accent-hover disabled:opacity-60">{busy ? 'Sending…' : 'Send invite'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function EditStaffModal({ propertyId, member, onClose }) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState(member.role);
  const [permissions, setPermissions] = useState(member.permissions);
  const onSubmit = async () => {
    await updateStaff(propertyId, member.id, { role, permissions });
    await queryClient.invalidateQueries({ queryKey: ['staff', propertyId] });
  };
  return (
    <ModalForm title={`Access for ${member.name}`} onClose={onClose} onSubmit={onSubmit} submitLabel="Save access">
      <SelectField label="Role" options={ROLES} value={role} onChange={(e) => setRole(e.target.value)} />
      <PermissionBoxes value={permissions} onChange={setPermissions} />
    </ModalForm>
  );
}

export function AnnouncementModal({ propertyId, onClose }) {
  const [f, setF] = useState({ title: '', body: '' });
  const onSubmit = async () => {
    await sendAnnouncement(propertyId, f);
  };
  return (
    <ModalForm title="Send announcement" onClose={onClose} onSubmit={onSubmit} submitLabel="Send to residents">
      <Field label="Title" required minLength={3} maxLength={120} value={f.title} onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} />
      <label className="block text-sm font-medium text-slate-700">
        Message
        <textarea required minLength={3} maxLength={1000} rows={4} value={f.body} onChange={(e) => setF((p) => ({ ...p, body: e.target.value }))} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      <p className="text-xs text-slate-500">Sent as a notification (and email) to every resident who has a login.</p>
    </ModalForm>
  );
}

// Owner creates the login and hands over the credentials (no email needed).
export function CreateStaffLoginModal({ propertyId, onClose }) {
  const queryClient = useQueryClient();
  const [f, setF] = useState({ name: '', email: '', role: 'warden', password: '' });
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS.warden);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.value }));
  const setRole = (e) => {
    setF((prev) => ({ ...prev, role: e.target.value }));
    setPermissions(DEFAULT_PERMISSIONS[e.target.value]);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { password, ...rest } = f;
      setResult(await createStaffLogin(propertyId, { ...rest, permissions, ...(password && { password }) }));
      await queryClient.invalidateQueries({ queryKey: ['staff', propertyId] });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <Modal title="Login created" onClose={onClose}>
        <p className="mb-3 text-sm text-slate-700">{result.user.name} can now sign in as {result.user.role}.</p>
        <CredentialsCard email={result.user.email} password={result.temporaryPassword} />
        <div className="mt-4 flex justify-end"><button type="button" onClick={onClose} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent">Done</button></div>
      </Modal>
    );
  }
  return (
    <Modal title="Create a login" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner error={error} />
        <Field label="Name" required minLength={2} maxLength={80} value={f.name} onChange={set('name')} />
        <Field label="Email (their login ID)" type="email" required value={f.email} onChange={set('email')} />
        <SelectField label="Role" options={ROLES} value={f.role} onChange={setRole} />
        <Field label="Password (optional)" type="text" autoComplete="off" minLength={8} value={f.password} onChange={set('password')} />
        <p className="-mt-2 text-xs text-slate-500">Leave blank and StayOS generates a strong one. Either way they must change it at first sign-in.</p>
        <PermissionBoxes value={permissions} onChange={setPermissions} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-hover disabled:opacity-60">{busy ? 'Creating…' : 'Create login'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function ResetStaffPasswordModal({ propertyId, member, onClose }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await resetStaffPassword(propertyId, member.id));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Reset password for ${member.name}`} onClose={onClose}>
      <ErrorBanner error={error} />
      {result ? (
        <>
          <CredentialsCard email={member.email} password={result.temporaryPassword} />
          <div className="mt-4 flex justify-end"><button type="button" onClick={onClose} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent">Done</button></div>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-700">This signs {member.name} out everywhere and gives you a new temporary password to pass on. Their old password stops working.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">Cancel</button>
            <button type="button" disabled={busy} onClick={reset} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-hover disabled:opacity-60">{busy ? 'Resetting…' : 'Reset password'}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
