import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { homeFor } from '../lib/roles.js';
import Landing from './Landing.jsx';

// "/" is the public landing page; signed-in people go straight to their own home.
export default function Home() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-slate-50" aria-busy="true" />;
  if (user) return <Navigate to={homeFor(user)} replace />;
  return <Landing />;
}
