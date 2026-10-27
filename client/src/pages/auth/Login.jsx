import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthForm, { Field } from '../../components/AuthForm.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_HOME } from '../../lib/roles.js';

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const next = await login(form);
      navigate(ROLE_HOME[next.role], { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <AuthForm
      title="Log in"
      subtitle="Welcome back."
      error={error}
      submitting={submitting}
      submitLabel="Log in"
      onSubmit={onSubmit}
      footer={
        <>
          New owner?{' '}
          <Link to="/register" className="font-medium text-accent-ink hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Field label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
      <Field
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={form.password}
        onChange={set('password')}
      />
    </AuthForm>
  );
}
