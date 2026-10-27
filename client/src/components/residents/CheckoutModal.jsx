import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Modal from '../Modal.jsx';
import ErrorBanner from '../ErrorBanner.jsx';
import { Field } from '../AuthForm.jsx';
import useDebounced from '../../hooks/useDebounced.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatPaise, formatPeriod, parseRupeesToPaise, todayISO } from '../../lib/format.js';
import { commitCheckout, previewCheckout } from '../../services/refunds.js';

const blankRow = () => ({ amount: '', reason: '', evidenceRef: '' });

function Line({ label, value, strong, tone }) {
  return (
    <div className={`flex justify-between ${strong ? 'font-semibold' : ''} ${tone ?? ''}`}>
      <span>{label}</span>
      <span>{formatPaise(value)}</span>
    </div>
  );
}

/*
 * Two-step check-out. Every figure on screen is the server's preview; the client only turns what
 * the user typed into integer paise.
 */
export default function CheckoutModal({ stay, onClose }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = user.role === 'owner';
  const [step, setStep] = useState(1);
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState([]);
  const [deductRent, setDeductRent] = useState(true);
  const [force, setForce] = useState(false);
  const [forceReason, setForceReason] = useState('');
  const [approveNow, setApproveNow] = useState(false);
  const [preview, setPreview] = useState({ data: null, error: null });
  const [submitError, setSubmitError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const parsed = rows.map((r) => ({ ...r, paise: r.amount.trim() === '' ? null : parseRupeesToPaise(r.amount) }));
  const filled = parsed.filter((r) => r.amount.trim() || r.reason.trim() || r.evidenceRef.trim());
  const invalid = filled.some((r) => !r.paise || r.reason.trim().length < 3);
  const deductions = filled.map((r) => ({ amountPaise: r.paise, reason: r.reason.trim(), ...(r.evidenceRef.trim() && { evidenceRef: r.evidenceRef.trim() }) }));
  const request = invalid || !date ? null : JSON.stringify({ actualCheckOutDate: date, deductions, deductOutstandingRent: deductRent });
  const debounced = useDebounced(request, 300);

  useEffect(() => {
    if (!debounced || debounced !== request) return undefined;
    let current = true;
    previewCheckout(stay.id, JSON.parse(debounced))
      .then((data) => current && setPreview({ data, error: null }))
      .catch((error) => current && setPreview({ data: null, error }));
    return () => {
      current = false;
    };
  }, [debounced, request, stay.id]);

  const p = request ? preview.data : null;
  const blocked = (p?.blockingIssues.length ?? 0) > 0;
  const canConfirm = p && (!blocked || (isOwner && force && forceReason.trim().length >= 3));

  const setRow = (i, key) => (e) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: e.target.value } : r)));

  const confirm = async () => {
    setBusy(true);
    setSubmitError(null);
    try {
      const result = await commitCheckout(stay.id, {
        ...JSON.parse(request),
        ...(blocked && { force: true, forceReason: forceReason.trim() }),
        ...(approveNow && { approveRefundNow: true }),
      });
      await Promise.all(['residents', 'resident', 'stays', 'refunds', 'rent-charges', 'balance'].map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
      await queryClient.invalidateQueries({ queryKey: ['beds'] });
      await queryClient.invalidateQueries({ queryKey: ['property'] });
      setDone(result);
    } catch (err) {
      setSubmitError(err);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Modal title="Checked out" onClose={onClose}>
        <p className="text-sm text-slate-700">
          Refund of <strong>{formatPaise(done.refund.refundablePaise)}</strong> is {done.refund.status.replace('_', ' ')}. Approve and pay it from the Refunds page.
        </p>
        {done.warnings.length > 0 && (
          <ul className="mt-3 list-disc pl-5 text-sm text-amber-800">
            {done.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-onaccent">Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Check out · Room ${stay.room.number} · Bed ${stay.bed.label}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-slate-500">Step {step} of 2 · {step === 1 ? 'Figures and deductions' : 'Review and confirm'}</p>

        {step === 1 && (
          <>
            <Field label="Check-out date" type="date" required min={stay.checkInDate.slice(0, 10)} max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-700">Deposit deductions</h3>
                <button type="button" onClick={() => setRows((r) => [...r, blankRow()])} className="text-xs underline">Add deduction</button>
              </div>
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[6rem_1fr_1fr_auto] items-end gap-2">
                  <Field label="₹" inputMode="decimal" value={r.amount} onChange={setRow(i, 'amount')} error={r.amount && parseRupeesToPaise(r.amount) === null ? 'Invalid' : undefined} />
                  <Field label="Reason" value={r.reason} maxLength={200} onChange={setRow(i, 'reason')} />
                  <Field label="Evidence ref" value={r.evidenceRef} maxLength={200} onChange={setRow(i, 'evidenceRef')} />
                  <button type="button" aria-label="Remove deduction" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))} className="pb-2 text-slate-400 hover:text-red-600">✕</button>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={deductRent} onChange={(e) => setDeductRent(e.target.checked)} />
              Deduct outstanding rent from the deposit
            </label>
          </>
        )}

        <ErrorBanner error={preview.error} />
        {invalid && <p className="text-sm text-red-600">Each deduction needs a valid amount and a reason.</p>}

        {p && (
          <div className="space-y-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            <div className="space-y-1">
              <Line label="Rent charged" value={p.rentSummary.totalChargedPaise} />
              <Line label="Rent paid" value={p.rentSummary.totalPaidPaise} />
              <Line label="Rent outstanding" value={p.rentSummary.outstandingRentPaise} tone={p.rentSummary.outstandingRentPaise > 0 ? 'text-red-700' : undefined} />
            </div>
            <div className="space-y-1 border-t border-slate-200 pt-2">
              <Line label="Deposit held" value={p.deposit.originalDepositPaise} />
              <Line label="Documented deductions" value={-p.deposit.deductionsTotalPaise} />
              <Line label="Outstanding rent deducted" value={-p.deposit.outstandingRentDeductedPaise} />
              <Line label="Refundable" value={p.deposit.refundablePaise} strong />
            </div>
            {p.rentSummary.charges.some((c) => c.toBeWaived) && (
              <p className="text-xs text-slate-500">
                Waived on check-out: {p.rentSummary.charges.filter((c) => c.toBeWaived).map((c) => formatPeriod(c.periodKey)).join(', ')}
              </p>
            )}
          </div>
        )}

        {p?.warnings.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-amber-800">{p.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        )}
        {blocked && (
          <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            <p className="font-medium">Blocking issues</p>
            <ul className="list-disc pl-5">{p.blockingIssues.map((w) => <li key={w}>{w}</li>)}</ul>
            {step === 2 && (isOwner ? (
              <div className="mt-2 space-y-2 text-slate-800">
                <label className="flex items-center gap-2"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Override and check out anyway</label>
                {force && <Field label="Reason for override (logged)" value={forceReason} maxLength={300} onChange={(e) => setForceReason(e.target.value)} />}
              </div>
            ) : (
              <p className="mt-2">Only an owner can override these. Resolve them or ask an owner to complete the check-out.</p>
            ))}
          </div>
        )}

        {step === 2 && isOwner && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={approveNow} onChange={(e) => setApproveNow(e.target.checked)} />
            Approve the refund now (it still has to be marked paid separately)
          </label>
        )}

        <ErrorBanner error={submitError} />
        <div className="flex justify-between gap-2 pt-2">
          <button type="button" onClick={step === 1 ? onClose : () => setStep(1)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step === 1 ? (
            <button type="button" disabled={!p} onClick={() => setStep(2)} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-onaccent disabled:opacity-50">
              Review
            </button>
          ) : (
            <button type="button" disabled={!canConfirm || busy} onClick={confirm} className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-onaccent disabled:opacity-50">
              {busy ? 'Checking out…' : 'Confirm check-out'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
