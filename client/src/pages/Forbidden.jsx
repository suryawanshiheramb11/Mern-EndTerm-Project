import { Link } from 'react-router-dom';

export default function Forbidden() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-50 text-slate-800">
      <h1 className="text-3xl font-bold">403</h1>
      <p className="text-slate-500">You don&apos;t have access to this page.</p>
      <Link to="/" className="text-sm font-medium underline">
        Go home
      </Link>
    </div>
  );
}
