import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AuthLayout, { Alert, Divider, PrimaryButton, TextField } from '../../components/auth/AuthLayout.jsx';
import GoogleButton from '../../components/auth/GoogleButton.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { homeFor } from '../../lib/roles.js';
import * as authApi from '../../services/auth.js';

export default function Register() {
  const { user, loading, register, setUser } = useAuth();
  const navigate = useNavigate();
  const config = useQuery({ queryKey: ['auth', 'config'], queryFn: authApi.getAuthConfig, staleTime: Infinity, retry: 1 });
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={homeFor(user)} replace />;

  const done = (next) => {
    setUser(next);
    navigate(homeFor(next), { replace: true });
  };
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setBusy(true);
    try {
      done(await register({ ...form, role: 'owner' }));
    } catch (err) {
      setError(err.message);
      setFieldErrors(Object.fromEntries((err.errors ?? []).map((i) => [i.field.replace(/^body\./, ''), i.message])));
    } finally {
      setBusy(false);
    }
  };

  const withGoogle = async (credential) => {
    setError('');
    setBusy(true);
    try {
      done(await authApi.googleSignIn(credential, 'register'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create your owner account"
      subtitle="Add your property and start in minutes. Free for 14 days."
      footer={<>Already registered? <Link to="/login" className="font-semibold text-accent-ink hover:underline">Log in</Link></>}
    >
      <GoogleButton intent="register" clientId={config.data?.googleClientId} onCredential={withGoogle} onError={(e) => setError(e.message)} />
      <Divider>or sign up with email</Divider>
      <Alert>{error}</Alert>
      <form className="space-y-4" onSubmit={onSubmit}>
        <TextField label="Full name" autoComplete="name" required value={form.name} onChange={set('name')} error={fieldErrors.name} />
        <TextField label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={fieldErrors.email} />
        <TextField label="Password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={set('password')} error={fieldErrors.password} hint="At least 8 characters, with a letter and a number." />
        <PrimaryButton busy={busy}>Create account</PrimaryButton>
      </form>
      <p className="mt-4 text-center text-xs text-slate-500">Wardens, maintenance staff and students do not register here. Your owner gives them a login.</p>
    </AuthLayout>
  );
}
