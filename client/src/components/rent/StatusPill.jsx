const STYLES = {
  pending: 'bg-slate-100 text-slate-700',
  partial: 'bg-amber-50 text-amber-800',
  paid: 'bg-green-50 text-green-700',
  overdue: 'bg-red-50 text-red-700',
  waived: 'bg-blue-50 text-blue-700',
  recorded: 'bg-slate-100 text-slate-700',
  verified: 'bg-green-50 text-green-700',
  reversed: 'bg-red-50 text-red-700',
};

export default function StatusPill({ status }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STYLES[status] ?? STYLES.pending}`}>{status}</span>;
}
