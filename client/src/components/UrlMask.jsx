import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Pages worth a real, shareable address. Everything behind sign-in keeps the address bar at "/":
// the app still navigates normally, the URL just does not spell out where you are.
const PUBLIC_PATHS = new Set(['/', '/pricing', '/login', '/register', '/reset-password', '/forbidden']);

export default function UrlMask() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  useEffect(() => {
    if (user && !PUBLIC_PATHS.has(pathname)) window.history.replaceState(window.history.state, '', '/');
  }, [user, pathname]);
  return null;
}
