import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { homeFor } from '../lib/roles.js';
import Landing from './Landing.jsx';

// "/" is the public landing page; signed-in people go straight to their own home.
export default function Home() {
  const { user, loading } = useAuth();
  // Show the landing page straight away; a signed-in person is redirected once the session check lands.
  if (!loading && user) return <Navigate to={homeFor(user)} replace />;
  return <Landing />;
}
