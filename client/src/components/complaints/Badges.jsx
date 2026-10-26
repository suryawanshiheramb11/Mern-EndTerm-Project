const URGENCY = { high: 'bg-red-50 text-red-700', medium: 'bg-amber-50 text-amber-800', low: 'bg-green-50 text-green-700' };
const SLA = {
  ok: ['bg-green-50 text-green-700', 'On track'],
  due_soon: ['bg-amber-50 text-amber-800', 'Due soon'],
  overdue: ['bg-red-50 text-red-700', 'Overdue'],
};
const STATUS = {
  new: 'bg-slate-100 text-slate-700',
  acknowledged: 'bg-blue-50 text-blue-700',
  assigned: 'bg-indigo-50 text-indigo-700',
  in_progress: 'bg-amber-50 text-amber-800',
  resolved: 'bg-green-50 text-green-700',
  closed: 'bg-slate-100 text-slate-500',
  reopened: 'bg-red-50 text-red-700',
};
const pill = 'rounded-full px-2 py-0.5 text-xs font-medium capitalize';

export const UrgencyBadge = ({ urgency }) => <span className={`${pill} ${URGENCY[urgency]}`}>{urgency}</span>;
export const StatusBadge = ({ status }) => <span className={`${pill} ${STATUS[status]}`}>{status.replace('_', ' ')}</span>;
export const PriorityBadge = ({ priority }) => (priority ? <span className={`${pill} bg-slate-100 text-slate-700`}>P: {priority}</span> : null);
export function SlaBadge({ state, dueAt }) {
  if (!state) return null;
  const [style, label] = SLA[state];
  return (
    <span className={`${pill} normal-case ${style}`} title={`Due ${new Date(dueAt).toLocaleString('en-IN')}`}>
      SLA: {label}
    </span>
  );
}
