import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Modal from '../../components/Modal.jsx';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import RefundsTable from '../../components/refunds/RefundsTable.jsx';
import ReceiptModal from '../../components/rent/ReceiptModal.jsx';
import { ChargesTable, PaymentsTable } from '../../components/rent/RentTables.jsx';
import { formatPaise, toPaise } from '../../lib/format.js';
import { createRazorpayOrder, getProfile, listMyCharges, listMyPayments, listMyRefunds, verifyRazorpayPayment } from '../../services/me.js';

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
  const profile = useQuery({ queryKey: ['me', 'profile'], queryFn: getProfile });
  const charges = useQuery({ queryKey: ['me', 'charges'], queryFn: listMyCharges });
  const payments = useQuery({ queryKey: ['me', 'payments'], queryFn: listMyPayments });
  const refunds = useQuery({ queryKey: ['me', 'refunds'], queryFn: listMyRefunds });

  const refresh = () => qc.invalidateQueries({ queryKey: ['me'] });

  // method: 'upi' puts UPI first (QR or app on desktop, intent on phones); 'other' leads with cards and netbanking.
  const payOnline = async (charge, amountPaise, method) => {
    setPayError(null);
    setPaying(true);
    try {
      const [order] = await Promise.all([createRazorpayOrder(charge.id, amountPaise), loadCheckout()]);
      const upiBlock = { name: 'Pay using UPI', instruments: [{ method: 'upi' }] };
      const otherBlock = { name: 'Cards, netbanking and wallets', instruments: [{ method: 'card' }, { method: 'netbanking' }, { method: 'wallet' }] };
      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: 'StayOS',
        description: order.description,
        theme: { color: '#0a66d6' },
        prefill: { name: profile.data?.user?.name, email: profile.data?.user?.email, contact: profile.data?.resident?.phone },
        method: { upi: true, card: true, netbanking: true, wallet: true, emi: false, paylater: false },
        config: {
          display: {
            blocks: { upi: upiBlock, other: otherBlock },
            sequence: method === 'upi' ? ['block.upi', 'block.other'] : ['block.other', 'block.upi'],
            preferences: { show_default_blocks: false },
          },
        },
        retry: { enabled: true, max_count: 3 },
        modal: { confirm_close: true, ondismiss: () => setPaying(false) },
        handler: async (response) => {
          try {
            await verifyRazorpayPayment(response);
          } catch (err) {
            setPayError(err);
          }
          refresh();
          setPaying(false);
        },
      });
      checkout.on('payment.failed', (r) => setPayError(new Error(r.error?.description || 'The payment did not go through. You have not been charged, or the bank will refund it.')));
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
          <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
            <p className="text-sm text-slate-600">Outstanding (including any late fee): <strong>{formatPaise(payCharge.outstandingPaise)}</strong>. Pay all of it or part now and the rest later.</p>
            <label className="block text-sm font-medium text-slate-700">
              Amount (₹)
              <input type="number" inputMode="decimal" min="1" max={payCharge.outstandingPaise / 100} step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full border border-slate-300 px-3" />
            </label>
            {['upi', 'other'].map((m) => (
              <button
                key={m}
                type="submit"
                onClick={(e) => {
                  if (!e.currentTarget.form.reportValidity()) return;
                  const charge = payCharge;
                  setPayCharge(null);
                  payOnline(charge, toPaise(amount), m);
                }}
                className={m === 'upi' ? 'w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-onaccent hover:bg-accent-hover' : 'w-full rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-800 hover:bg-slate-100'}
              >
                {m === 'upi' ? 'Pay with UPI' : 'Cards, netbanking or wallet'}
              </button>
            ))}
            <p className="text-center text-xs text-slate-500">Secured by Razorpay. UPI works with any UPI app.</p>
          </form>
        </Modal>
      )}
      {receipt && <ReceiptModal paymentId={receipt.id} onClose={() => setReceipt(null)} />}
    </div>
  );
}
