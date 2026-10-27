import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_HOME } from '../lib/roles.js';

// "/" has no content of its own: signed-in people go to their home, everyone else to sign-in.
export default function Home() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>;
  return <Navigate to={user ? ROLE_HOME[user.role] : '/login'} replace />;
}
