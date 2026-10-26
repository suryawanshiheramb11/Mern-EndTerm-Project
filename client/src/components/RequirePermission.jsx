import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { hasAnyPermission } from '../lib/permissions.js';

// Route-level guard for staff screens that need a permission at one of their properties.
// The server enforces the same rule; this only avoids showing a page that would be all errors.
export default function RequirePermission({ any, children }) {
  const { user } = useAuth();
  return hasAnyPermission(user, ...any) ? children : <Navigate to="/forbidden" replace />;
}
