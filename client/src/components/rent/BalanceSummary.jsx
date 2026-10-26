import { useQuery } from '@tanstack/react-query';
import ErrorBanner from '../ErrorBanner.jsx';
import { formatPaise } from '../../lib/format.js';
import { getBalance } from '../../services/rent.js';

function Stat({ label, value, tone, hint }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={`text-lg font-semibold ${tone ?? 'text-slate-800'}`}>{formatPaise(value)}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

// All figures are computed by the API; this component only displays them.
export default function BalanceSummary({ residentId }) {
  const { data: b, error, isLoading } = useQuery({ queryKey: ['balance', residentId], queryFn: () => getBalance(residentId) });
  if (isLoading) return <p className="text-sm text-slate-500">Loading balance…</p>;
  if (error) return <ErrorBanner error={error} />;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="Rent due" value={b.totalDuePaise} />
      <Stat label="Rent paid" value={b.totalPaidPaise} />
      <Stat label="Outstanding" value={b.outstandingPaise} tone={b.outstandingPaise > 0 ? 'text-red-700' : 'text-green-700'} hint={b.overduePaise > 0 ? `${formatPaise(b.overduePaise)} overdue` : undefined} />
      <Stat label="Deposit held" value={b.depositHeldPaise} hint={b.advancesPaise > 0 ? `+ ${formatPaise(b.advancesPaise)} advance` : 'Not part of rent'} />
    </div>
  );
}
