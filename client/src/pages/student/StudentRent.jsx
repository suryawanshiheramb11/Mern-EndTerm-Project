import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import RefundsTable from '../../components/refunds/RefundsTable.jsx';
import ReceiptModal from '../../components/rent/ReceiptModal.jsx';
import { ChargesTable, PaymentsTable } from '../../components/rent/RentTables.jsx';
import { listMyCharges, listMyPayments, listMyRefunds } from '../../services/me.js';

export default function StudentRent() {
  const [receipt, setReceipt] = useState(null);
  const charges = useQuery({ queryKey: ['me', 'charges'], queryFn: listMyCharges });
  const payments = useQuery({ queryKey: ['me', 'payments'], queryFn: listMyPayments });
  const refunds = useQuery({ queryKey: ['me', 'refunds'], queryFn: listMyRefunds });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-800">Rent history</h1>
      <section className="space-y-2">
        <h2 className="font-semibold text-slate-800">Rent charges</h2>
        <ErrorBanner error={charges.error} />
        <ChargesTable items={charges.data?.items ?? []} showResident={false} isOwner={false} onAction={() => {}} />
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold text-slate-800">Payments and receipts</h2>
        <ErrorBanner error={payments.error} />
        <PaymentsTable items={payments.data?.items ?? []} showResident={false} isOwner={false} onAction={(a) => a.type === 'receipt' && setReceipt(a.payment)} />
        <p className="text-xs text-slate-500">Open a receipt and use Print to save it as a PDF.</p>
      </section>
      {(refunds.data?.items.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-slate-800">Deposit refund</h2>
          <RefundsTable items={refunds.data.items} showResident={false} isOwner={false} onAction={() => {}} />
        </section>
      )}
      {receipt && <ReceiptModal paymentId={receipt.id} onClose={() => setReceipt(null)} />}
    </div>
  );
}
