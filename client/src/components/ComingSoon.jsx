export default function ComingSoon({ title = 'StayOS' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-50 text-slate-800">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-slate-500">Coming soon</p>
    </div>
  );
}
