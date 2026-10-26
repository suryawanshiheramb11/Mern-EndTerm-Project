import { useQuery } from '@tanstack/react-query';
import Modal from '../Modal.jsx';
import ErrorBanner from '../ErrorBanner.jsx';
import { formatDate, formatPaise, formatPeriod } from '../../lib/format.js';
import { getReceipt } from '../../services/rent.js';

const METHOD = { cash: 'Cash', upi: 'UPI', bank: 'Bank transfer', card: 'Card', other: 'Other' };

// Renders the server's JSON receipt as a printable page (PDF comes in a later phase).
export default function ReceiptModal({ paymentId, onClose }) {
  const { data: r, error, isLoading } = useQuery({ queryKey: ['receipt', paymentId], queryFn: () => getReceipt(paymentId) });

  return (
    <Modal title="Receipt" onClose={onClose}>
      <ErrorBanner error={error} />
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {r && (
        <>
          <div id="receipt-print" className="space-y-3 text-sm text-slate-800">
            <div className="border-b border-slate-200 pb-2">
              <div className="text-base font-bold">{r.property.name}</div>
              <div className="text-xs text-slate-500">
                {r.property.address.line1}, {r.property.address.city} {r.property.address.pincode}
              </div>
            </div>
            <div className="flex justify-between">
              <span className="font-mono">{r.receiptNumber}</span>
              <span>{formatDate(r.paidAt)}</span>
            </div>
            <dl className="space-y-1">
              <div className="flex justify-between"><dt className="text-slate-500">{r.isReversal ? 'Refunded to' : 'Received from'}</dt><dd>{r.resident.fullName}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Method</dt><dd>{METHOD[r.method]}{r.reference ? ` · ${r.reference}` : ''}</dd></div>
              {r.receivedBy && <div className="flex justify-between"><dt className="text-slate-500">Received by</dt><dd>{r.receivedBy}</dd></div>}
            </dl>
            <table className="w-full">
              <tbody className="divide-y divide-slate-100">
                {r.allocations.map((a) => (
                  <tr key={a.chargeId}>
                    <td className="py-1">Rent · {formatPeriod(a.periodKey)}</td>
                    <td className="py-1 text-right">{formatPaise(a.amountPaise)}</td>
                  </tr>
                ))}
                {r.advancePaise !== 0 && (
                  <tr>
                    <td className="py-1">Advance</td>
                    <td className="py-1 text-right">{formatPaise(r.advancePaise)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-300 font-semibold">
                  <td className="py-1">Total</td>
                  <td className="py-1 text-right">{formatPaise(r.amountPaise)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="text-xs text-slate-500">
              Status: {r.status}
              {r.verified ? '' : r.isReversal ? ' (reversal entry)' : r.status === 'reversed' ? ` (reversed by ${r.reversedByReceipt ?? 'a reversal entry'})` : ' (not yet verified by the owner)'}
            </p>
          </div>
          <div className="mt-4 flex justify-end gap-2 print:hidden">
            <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-2 text-sm">Close</button>
            <button type="button" onClick={() => window.print()} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Print</button>
          </div>
        </>
      )}
    </Modal>
  );
}
