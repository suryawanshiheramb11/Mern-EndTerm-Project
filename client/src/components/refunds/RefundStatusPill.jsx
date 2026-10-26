const LABEL = { pending_approval: 'Pending approval', approved: 'Approved', paid: 'Paid', cancelled: 'Cancelled' };
const STYLE = {
  pending_approval: 'bg-amber-50 text-amber-800',
  approved: 'bg-blue-50 text-blue-700',
  paid: 'bg-green-50 text-green-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export default function RefundStatusPill({ status }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLE[status]}`}>{LABEL[status] ?? status}</span>;
}
