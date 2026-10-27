import { formatDate, formatPaise } from '../../lib/format.js';
import RefundStatusPill from './RefundStatusPill.jsx';

const btn = 'rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50';

export default function RefundsTable({ items, showResident = true, isOwner, onAction }) {
  if (items.length === 0) return <p className="text-sm text-slate-500">No refunds.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-medium text-slate-500">
          <tr>
            {showResident && <th className="px-4 py-2">Resident</th>}
            <th className="px-4 py-2 text-right">Deposit</th>
            <th className="px-4 py-2 text-right">Deductions</th>
            <th className="px-4 py-2 text-right">Refund</th>
            <th className="px-4 py-2">Status</th>
            {isOwner && <th className="px-4 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((r) => (
            <tr key={r.id}>
              {showResident && <td className="px-4 py-2">{r.resident?.fullName ?? '—'}</td>}
              <td className="px-4 py-2 text-right">{formatPaise(r.originalDepositPaise)}</td>
              <td className="px-4 py-2 text-right" title={r.deductions.map((d) => `${d.reason}: ${formatPaise(d.amountPaise)}`).join('\n')}>
                {formatPaise(r.totalDeductionsPaise)}
              </td>
              <td className="px-4 py-2 text-right font-medium">{formatPaise(r.refundablePaise)}</td>
              <td className="px-4 py-2">
                <RefundStatusPill status={r.status} />
                {r.status === 'paid' && <span className="ml-2 text-xs text-slate-400">{formatDate(r.paidAt)} · {r.method}{r.reference ? ` · ${r.reference}` : ''}</span>}
              </td>
              {isOwner && (
                <td className="space-x-1 whitespace-nowrap px-4 py-2 text-right">
                  {r.status === 'pending_approval' && (
                    <>
                      <button type="button" className={btn} onClick={() => onAction({ type: 'approve', refund: r })}>Approve</button>
                      <button type="button" className={btn} onClick={() => onAction({ type: 'cancel', refund: r })}>Cancel</button>
                    </>
                  )}
                  {r.status === 'approved' && <button type="button" className={btn} onClick={() => onAction({ type: 'pay', refund: r })}>Mark paid</button>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
