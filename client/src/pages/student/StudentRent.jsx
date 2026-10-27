import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '../../components/Modal.jsx';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import RefundsTable from '../../components/refunds/RefundsTable.jsx';
import ReceiptModal from '../../components/rent/ReceiptModal.jsx';
import { ChargesTable, PaymentsTable } from '../../components/rent/RentTables.jsx';
import { formatPaise, toPaise } from '../../lib/format.js';
import { createRazorpayOrder, listMyCharges, listMyPayments, listMyRefunds, verifyRazorpayPayment } from '../../services/me.js';

const loadCheckout = () =>
  new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load the payment window. Check your connection.'));
    document.body.appendChild(script);
    return undefined;
  });

export default function StudentRent() {
  const [receipt, setReceipt] = useState(null);
  const [payError, setPayError] = useState(null);
  const [paying, setPaying] = useState(false);
  const [payCharge, setPayCharge] = useState(null);
  const [amount, setAmount] = useState('');
  const qc = useQueryClient();
  const charges = useQuery({ queryKey: ['me', 'charges'], queryFn: listMyCharges });
  const payments = useQuery({ queryKey: ['me', 'payments'], queryFn: listMyPayments });
  const refunds = useQuery({ queryKey: ['me', 'refunds'], queryFn: listMyRefunds });

  const refresh = () => qc.invalidateQueries({ queryKey: ['me'] });

  const payOnline = async (charge, amountPaise) => {
    setPayError(null);
    setPaying(true);
    try {
      const [order] = await Promise.all([createRazorpayOrder(charge.id, amountPaise), loadCheckout()]);
      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: 'StayOS',
        description: order.description,
        theme: { color: '#0f766e' },
        handler: async (response) => {
          try {
            await verifyRazorpayPayment(response);
          } catch (err) {
            setPayError(err);
          }
          refresh();
          setPaying(false);
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      checkout.open();
    } catch (err) {
      setPayError(err);
      setPaying(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="page-title">Rent history</h1>
      <section className="space-y-2">
        <h2 className="font-semibold text-slate-800">Rent charges</h2>
        <ErrorBanner error={charges.error ?? payError} />
        <ChargesTable items={charges.data?.items ?? []} showResident={false} isOwner={false} canPay={!paying} onAction={(a) => { if (a.type === 'pay') { setAmount(String(a.charge.outstandingPaise / 100)); setPayCharge(a.charge); } }} />
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
      {payCharge && (
        <Modal title="Pay rent online" onClose={() => setPayCharge(null)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const charge = payCharge;
              setPayCharge(null);
              payOnline(charge, toPaise(amount));
            }}
          >
            <p className="text-sm text-slate-600">Outstanding (including any late fee): <strong>{formatPaise(payCharge.outstandingPaise)}</strong>. You can pay all of it or a part now and the rest later.</p>
            <label className="block text-sm font-medium text-slate-700">
              Amount (₹)
              <input type="number" inputMode="decimal" min="1" max={payCharge.outstandingPaise / 100} step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full border border-slate-300 px-3" />
            </label>
            <button type="submit" className="w-full rounded-lg bg-accent px-4 py-2 font-medium text-onaccent hover:bg-accent-hover">Continue to payment</button>
          </form>
        </Modal>
      )}
      {receipt && <ReceiptModal paymentId={receipt.id} onClose={() => setReceipt(null)} />}
    </div>
  );
}
