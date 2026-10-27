import { formatDate, formatPaise, formatPeriod } from '../../lib/format.js';
import StatusPill from './StatusPill.jsx';

const th = 'px-4 py-2';
const btn = 'rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50';

export function ChargesTable({ items, showResident = true, isOwner, onAction }) {
  if (items.length === 0) return <p className="text-sm text-slate-500">No rent charges.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-medium text-slate-500">
          <tr>
            {showResident && <th className={th}>Resident</th>}
            <th className={th}>Month</th>
            <th className={th}>Due</th>
            <th className={`${th} text-right`}>Net due</th>
            <th className={`${th} text-right`}>Paid</th>
            <th className={`${th} text-right`}>Outstanding</th>
            <th className={th}>Status</th>
            {isOwner && <th className={th} />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((c) => (
            <tr key={c.id}>
              {showResident && <td className="px-4 py-2">{c.resident?.fullName ?? '—'}</td>}
              <td className="px-4 py-2">{formatPeriod(c.periodKey)}</td>
              <td className="px-4 py-2">{formatDate(c.dueDate)}</td>
              <td className="px-4 py-2 text-right">{formatPaise(c.netDuePaise)}</td>
              <td className="px-4 py-2 text-right">{formatPaise(c.paidPaise)}</td>
              <td className="px-4 py-2 text-right font-medium">{formatPaise(c.outstandingPaise)}</td>
              <td className="px-4 py-2">
                <StatusPill status={c.status} />
              </td>
              {isOwner && (
                <td className="space-x-1 whitespace-nowrap px-4 py-2 text-right">
                  {c.status !== 'waived' && (
                    <>
                      <button type="button" className={btn} onClick={() => onAction({ type: 'adjust', charge: c })}>Adjust</button>
                      {c.outstandingPaise > 0 && (
                        <button type="button" className={btn} onClick={() => onAction({ type: 'waive', charge: c })}>Waive</button>
                      )}
                    </>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PaymentsTable({ items, showResident = true, isOwner, onAction }) {
  if (items.length === 0) return <p className="text-sm text-slate-500">No payments.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-medium text-slate-500">
          <tr>
            <th className={th}>Receipt</th>
            {showResident && <th className={th}>Resident</th>}
            <th className={th}>Date</th>
            <th className={th}>Method</th>
            <th className={`${th} text-right`}>Amount</th>
            <th className={th}>Status</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((p) => {
            const isReversal = Boolean(p.reversalOf);
            return (
              <tr key={p.id} className={isReversal ? 'bg-red-50/40' : undefined}>
                <td className="px-4 py-2 font-mono text-xs">{p.receiptNumber}</td>
                {showResident && <td className="px-4 py-2">{p.resident?.fullName ?? '—'}</td>}
                <td className="px-4 py-2">{formatDate(p.paidAt)}</td>
                <td className="px-4 py-2 capitalize">
                  {p.method}
                  {p.reference && <span className="text-slate-400"> · {p.reference}</span>}
                </td>
                <td className="px-4 py-2 text-right">{formatPaise(p.amountPaise)}</td>
                <td className="px-4 py-2">{isReversal ? <span className="text-xs text-red-700">Reversal</span> : <StatusPill status={p.status} />}</td>
                <td className="space-x-1 whitespace-nowrap px-4 py-2 text-right">
                  <button type="button" className={btn} onClick={() => onAction({ type: 'receipt', payment: p })}>Receipt</button>
                  {isOwner && !isReversal && p.status === 'recorded' && (
                    <button type="button" className={btn} onClick={() => onAction({ type: 'verify', payment: p })}>Verify</button>
                  )}
                  {isOwner && !isReversal && p.status !== 'reversed' && (
                    <button type="button" className={btn} onClick={() => onAction({ type: 'reverse', payment: p })}>Reverse</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
