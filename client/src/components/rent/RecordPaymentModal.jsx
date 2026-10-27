import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ModalForm from '../ModalForm.jsx';
import ErrorBanner from '../ErrorBanner.jsx';
import { Field } from '../AuthForm.jsx';
import SelectField from '../SelectField.jsx';
import useDebounced from '../../hooks/useDebounced.js';
import { formatPaise, formatPeriod, paiseToInput, parseRupeesToPaise, todayISO } from '../../lib/format.js';
import { getBalance, invalidateRent, recordPayment } from '../../services/rent.js';
import { listResidents } from '../../services/residents.js';

const METHODS = ['cash', 'upi', 'bank', 'card', 'other'].map((m) => ({ value: m, label: m.toUpperCase() === 'UPI' ? 'UPI' : m[0].toUpperCase() + m.slice(1) }));

const newKey = () => crypto.randomUUID();

/*
 * Every number shown here (FIFO split, outstanding before/after) comes from the server's dryRun;
 * the client only parses what the user typed into integer paise. The idempotency key is reused on
 * retries of an unchanged form (so a double click or a flaky network cannot record twice) and
 * replaced as soon as the user edits anything.
 */
export default function RecordPaymentModal({ propertyId, residentId: presetResident, onClose, onRecorded }) {
  const queryClient = useQueryClient();
  const [f, setF] = useState({ residentId: presetResident ?? '', amount: '', method: 'cash', reference: '', paidAt: todayISO(), allowAdvance: false });
  const [manual, setManual] = useState(null); // null = server FIFO; otherwise { [chargeId]: 'rupees text' }
  const [preview, setPreview] = useState({ data: null, error: null });
  const keyRef = useRef(newKey());

  const residents = useQuery({
    queryKey: ['residents', { propertyId, status: 'active' }],
    queryFn: () => listResidents({ propertyId, status: 'active' }),
    enabled: !presetResident,
  });
  const residentId = f.residentId || (presetResident ? presetResident : residents.data?.items[0]?.id) || '';
  const balance = useQuery({ queryKey: ['balance', residentId], queryFn: () => getBalance(residentId), enabled: Boolean(residentId) });

  const touch = () => {
    keyRef.current = newKey();
  };
  const set = (key) => (e) => {
    touch();
    setF((prev) => ({ ...prev, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  };

  const amountPaise = parseRupeesToPaise(f.amount);
  const manualRows = manual && Object.entries(manual).map(([chargeId, text]) => ({ chargeId, paise: text.trim() === '' ? 0 : parseRupeesToPaise(text) }));
  const manualInvalid = manualRows?.some((r) => r.paise === null);
  const allocations = manualRows?.filter((r) => r.paise > 0).map((r) => ({ chargeId: r.chargeId, amountPaise: r.paise }));
  const request = { propertyId, residentId, amountPaise, allowAdvance: f.allowAdvance || undefined, ...(allocations && { allocations }) };
  const requestKey = amountPaise && residentId && !manualInvalid ? JSON.stringify(request) : null;
  const debouncedKey = useDebounced(requestKey, 300);

  useEffect(() => {
    if (!debouncedKey || debouncedKey !== requestKey) return undefined;
    let current = true;
    recordPayment({ ...JSON.parse(debouncedKey), method: f.method, dryRun: true })
      .then((data) => current && setPreview({ data, error: null }))
      .catch((error) => current && setPreview({ data: null, error }));
    return () => {
      current = false;
    };
  }, [debouncedKey, requestKey, f.method]);

  const shown = requestKey ? preview : { data: null, error: null };
  const fifo = new Map((shown.data?.allocations ?? []).map((a) => [a.chargeId, a.amountPaise]));
  const owing = (balance.data?.breakdownByCharge ?? []).filter((c) => c.outstandingPaise > 0);

  const editRow = (chargeId) => (e) => {
    touch();
    const base = manual ?? Object.fromEntries(owing.map((c) => [c.chargeId, fifo.has(c.chargeId) ? paiseToInput(fifo.get(c.chargeId)) : '']));
    setManual({ ...base, [chargeId]: e.target.value });
  };

  const onSubmit = async () => {
    if (!amountPaise) throw new Error('Enter a valid amount (up to 2 decimals)');
    if (manualInvalid) throw new Error('Fix the invalid allocation amounts');
    const res = await recordPayment({
      ...request,
      method: f.method,
      paidAt: f.paidAt,
      ...(f.reference && { reference: f.reference }),
      idempotencyKey: keyRef.current,
    });
    await invalidateRent(queryClient);
    onRecorded?.(res.payment);
  };

  return (
    <ModalForm title="Record payment" onClose={onClose} onSubmit={onSubmit} submitLabel="Record payment">
      {!presetResident && (
        <SelectField
          label="Resident"
          required
          value={residentId}
          onChange={(e) => {
            touch();
            setManual(null);
            setF((prev) => ({ ...prev, residentId: e.target.value }));
          }}
          options={(residents.data?.items ?? []).map((r) => ({ value: r.id, label: r.fullName }))}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)" inputMode="decimal" required value={f.amount} onChange={set('amount')} error={f.amount && amountPaise === null ? 'Use up to 2 decimals' : undefined} />
        <SelectField label="Method" options={METHODS} value={f.method} onChange={set('method')} />
        <Field label="Reference (UTR / cheque no.)" maxLength={100} value={f.reference} onChange={set('reference')} />
        <Field label="Paid on" type="date" max={todayISO()} required value={f.paidAt} onChange={set('paidAt')} />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-700">Apply to charges</h3>
          {manual && (
            <button type="button" onClick={() => { touch(); setManual(null); }} className="text-xs text-slate-600 underline">
              Reset to automatic (oldest first)
            </button>
          )}
        </div>
        {owing.length === 0 ? (
          <p className="text-sm text-slate-500">{balance.isLoading ? 'Loading…' : 'Nothing is outstanding for this resident.'}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs font-medium text-slate-500">
              <tr>
                <th className="py-1 text-left">Month</th>
                <th className="py-1 text-right">Outstanding</th>
                <th className="py-1 text-right">Apply (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {owing.map((c) => (
                <tr key={c.chargeId}>
                  <td className="py-1">
                    {formatPeriod(c.periodKey)} {c.overdue && <span className="text-xs text-red-600">overdue</span>}
                  </td>
                  <td className="py-1 text-right">{formatPaise(c.outstandingPaise)}</td>
                  <td className="py-1 text-right">
                    <input
                      aria-label={`Apply to ${c.periodKey}`}
                      inputMode="decimal"
                      value={manual ? manual[c.chargeId] ?? '' : fifo.has(c.chargeId) ? paiseToInput(fifo.get(c.chargeId)) : ''}
                      onChange={editRow(c.chargeId)}
                      className="w-24 rounded border border-slate-300 px-2 py-1 text-right"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={f.allowAdvance} onChange={set('allowAdvance')} />
        Keep any amount beyond what is owed as an advance
      </label>

      <ErrorBanner error={shown.error} />
      {shown.data && (
        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <div className="flex justify-between">
            <span>Outstanding now</span>
            <span>{formatPaise(shown.data.currentOutstandingPaise)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Outstanding after this payment</span>
            <span>{formatPaise(shown.data.projectedOutstandingPaise)}</span>
          </div>
          {shown.data.advancePaise > 0 && (
            <div className="flex justify-between text-amber-800">
              <span>Held as advance</span>
              <span>{formatPaise(shown.data.advancePaise)}</span>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-slate-500">Payments are recorded as received, not verified. An owner verifies them separately.</p>
    </ModalForm>
  );
}
