import { useAuth } from '../context/AuthContext.jsx';

export default function RolePlaceholder({ title }) {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-slate-800">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-slate-500">Signed in as {user.name} ({user.email}). Coming soon.</p>
      <button
        type="button"
        onClick={logout}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-onaccent hover:bg-accent-hover"
      >
        Log out
      </button>
    </div>
  );
}
