import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthForm, { Field } from '../../components/AuthForm.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_HOME } from '../../lib/roles.js';

export default function Register() {
  const { user, loading, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setSubmitting(true);
    try {
      const next = await register({ ...form, role: 'owner' });
      navigate(ROLE_HOME[next.role], { replace: true });
    } catch (err) {
      setError(err.message);
      setFieldErrors(Object.fromEntries(err.errors.map((i) => [i.field.replace(/^body\./, ''), i.message])));
    } finally {
      setSubmitting(false);
    }
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <AuthForm
      title="Create your owner account"
      error={error}
      submitting={submitting}
      submitLabel="Register"
      onSubmit={onSubmit}
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-medium text-accent-ink hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <Field label="Name" autoComplete="name" required value={form.name} onChange={set('name')} error={fieldErrors.name} />
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={form.email}
        onChange={set('email')}
        error={fieldErrors.email}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={form.password}
        onChange={set('password')}
        error={fieldErrors.password}
      />
    </AuthForm>
  );
}
