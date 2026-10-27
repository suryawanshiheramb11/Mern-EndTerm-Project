import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout, { Alert, PrimaryButton, TextField } from '../../components/auth/AuthLayout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { homeFor } from '../../lib/roles.js';
import * as authApi from '../../services/auth.js';

export default function ChangePassword() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const forced = user.mustChangePassword;
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (f.newPassword !== f.confirm) return setError('The two new passwords do not match.');
    setBusy(true);
    try {
      const next = await authApi.changePassword({ currentPassword: f.currentPassword || undefined, newPassword: f.newPassword });
      setUser(next);
      navigate(homeFor(next), { replace: true });
    } catch (err) {
      setError(err.errors?.[0]?.message ?? err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <AuthLayout
      title={forced ? 'Choose your own password' : 'Change password'}
      subtitle={forced ? 'You signed in with a temporary password. Set a new one to continue.' : 'You will be signed out of your other devices.'}
      footer={<button type="button" onClick={logout} className="font-semibold text-accent-ink hover:underline">Log out</button>}
    >
      <Alert>{error}</Alert>
      <form className="space-y-4" onSubmit={onSubmit}>
        <TextField label={forced ? 'Temporary password' : 'Current password'} type="password" autoComplete="current-password" required={!forced} value={f.currentPassword} onChange={set('currentPassword')} />
        <TextField label="New password" type="password" autoComplete="new-password" required minLength={8} value={f.newPassword} onChange={set('newPassword')} hint="At least 8 characters, with a letter and a number." />
        <TextField label="Confirm new password" type="password" autoComplete="new-password" required value={f.confirm} onChange={set('confirm')} />
        <PrimaryButton busy={busy}>Save password</PrimaryButton>
      </form>
    </AuthLayout>
  );
}
