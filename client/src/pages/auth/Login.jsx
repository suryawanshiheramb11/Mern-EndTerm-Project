import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AuthLayout, { Alert, Divider, PrimaryButton, TextField } from '../../components/auth/AuthLayout.jsx';
import GoogleButton from '../../components/auth/GoogleButton.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { homeFor } from '../../lib/roles.js';
import * as authApi from '../../services/auth.js';

const tab = (active) => `flex-1 rounded-full px-4 py-2 text-sm font-semibold ${active ? 'bg-white text-slate-900 shadow-card' : 'text-slate-600 hover:text-slate-900'}`;

export default function Login() {
  const { user, loading, login, setUser } = useAuth();
  const navigate = useNavigate();
  const config = useQuery({ queryKey: ['auth', 'config'], queryFn: authApi.getAuthConfig, staleTime: Infinity, retry: 1 });
  const [method, setMethod] = useState('password'); // 'password' | 'code'
  const [form, setForm] = useState({ email: '', password: '' });
  const [codeStep, setCodeStep] = useState('email'); // 'email' | 'code'
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!loading && user) return <Navigate to={homeFor(user)} replace />;

  const done = (next) => {
    setUser(next);
    navigate(homeFor(next), { replace: true });
  };
  const run = async (fn) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const sendCode = () => run(async () => {
    await authApi.requestOtp(form.email);
    setCodeStep('code');
    setCode('');
    setCooldown(60);
    setInfo(`If ${form.email} has a StayOS account, we have emailed it a 6-digit code.`);
  });

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to manage your property, or to see your room and rent."
      footer={<>New owner? <Link to="/register" className="font-semibold text-accent-ink hover:underline">Create an account</Link></>}
    >
      <GoogleButton clientId={config.data?.googleClientId} onCredential={(c) => run(async () => done(await authApi.googleSignIn(c, 'login')))} onError={(e) => setError(e.message)} />
      <Divider>or use your email</Divider>

      <div role="tablist" aria-label="Sign-in method" className="mb-5 flex gap-1 rounded-full bg-slate-100 p-1">
        <button type="button" role="tab" aria-selected={method === 'password'} className={tab(method === 'password')} onClick={() => { setMethod('password'); setError(''); }}>Password</button>
        <button type="button" role="tab" aria-selected={method === 'code'} className={tab(method === 'code')} onClick={() => { setMethod('code'); setError(''); }}>Email code</button>
      </div>

      <Alert>{error}</Alert>

      {method === 'password' ? (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(async () => done(await login(form))); }}>
          <TextField label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
          <TextField label="Password" type="password" autoComplete="current-password" required value={form.password} onChange={set('password')} />
          <PrimaryButton busy={busy}>Log in</PrimaryButton>
        </form>
      ) : config.data && !config.data.otpEnabled ? (
        <p className="rounded-xl bg-slate-100 px-3.5 py-3 text-sm text-slate-600">Email codes are not available yet because no email service is connected. Please use your password.</p>
      ) : codeStep === 'email' ? (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); sendCode(); }}>
          <TextField label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} hint="We will email you a 6-digit code. No password needed." />
          <PrimaryButton busy={busy}>Send code</PrimaryButton>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(async () => done(await authApi.verifyOtp(form.email, code))); }}>
          {info && <p className="rounded-xl bg-accent-tint px-3.5 py-2.5 text-sm text-accent-ink">{info}</p>}
          <TextField label="6-digit code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <PrimaryButton busy={busy}>Verify and log in</PrimaryButton>
          <div className="flex justify-between text-sm">
            <button type="button" className="font-semibold text-accent-ink hover:underline" onClick={() => { setCodeStep('email'); setError(''); }}>Use a different email</button>
            <button type="button" disabled={cooldown > 0 || busy} className="font-semibold text-accent-ink hover:underline disabled:text-slate-400 disabled:no-underline" onClick={sendCode}>{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}</button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
