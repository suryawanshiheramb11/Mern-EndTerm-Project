import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthForm, { Field } from '../../components/AuthForm.jsx';
import { resetPassword } from '../../services/auth.js';

// Also the landing page for student invites: setting a password activates the invited account.
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await resetPassword({ token, password });
      setDone(true);
    } catch (err) {
      setError(err.errors?.[0]?.message ?? err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-slate-800">
        <p>Your password has been set.</p>
        <Link to="/login" className="font-medium underline">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <AuthForm
      title="Set your password"
      error={!token ? 'This link is missing its token.' : error}
      submitting={submitting}
      submitLabel="Set password"
      onSubmit={onSubmit}
    >
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <p className="text-xs text-slate-500">At least 8 characters, with a letter and a number.</p>
    </AuthForm>
  );
}
