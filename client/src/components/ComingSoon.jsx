import { Link } from 'react-router-dom';

export default function ComingSoon({ title = 'StayOS' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-50 px-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-800">{title}</h1>
      <p className="text-slate-500">That page doesn&apos;t exist.</p>
      <Link to="/" className="mt-2 text-sm font-medium text-accent-ink hover:underline">Go home</Link>
    </div>
  );
}
