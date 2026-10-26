import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ModalForm from '../ModalForm.jsx';
import { Field } from '../AuthForm.jsx';
import { formatPaise, formatPeriod, parseRupeesToPaise } from '../../lib/format.js';
import { adjustCharge, invalidateRent, waiveCharge } from '../../services/rent.js';

// Owner-only corrections. Charges are never edited in place or deleted; this adds a logged
// adjustment (positive or negative) or waives what is still owed.
export default function ChargeActionModal({ charge, action, onClose }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [sign, setSign] = useState('+');
  const [reason, setReason] = useState('');
  const title = `${action === 'waive' ? 'Waive' : 'Adjust'} ${formatPeriod(charge.periodKey)} rent`;

  const onSubmit = async () => {
    if (action === 'waive') {
      await waiveCharge(charge.id, { reason });
    } else {
      const paise = parseRupeesToPaise(amount);
      if (!paise) throw new Error('Enter a valid amount (up to 2 decimals)');
      await adjustCharge(charge.id, { amountPaise: sign === '-' ? -paise : paise, reason });
    }
    await invalidateRent(queryClient);
  };

  return (
    <ModalForm title={title} onClose={onClose} onSubmit={onSubmit} submitLabel={action === 'waive' ? 'Waive' : 'Apply adjustment'}>
      <p className="text-sm text-slate-600">
        Net due {formatPaise(charge.netDuePaise)} · outstanding {formatPaise(charge.outstandingPaise)}
      </p>
      {action === 'adjust' && (
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <label className="block text-sm font-medium text-slate-700">
            Direction
            <select value={sign} onChange={(e) => setSign(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-2">
              <option value="+">Charge more</option>
              <option value="-">Reduce</option>
            </select>
          </label>
          <Field label="Amount (₹)" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      )}
      <Field label="Reason" required minLength={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      {action === 'waive' && <p className="text-xs text-slate-500">Waives the outstanding {formatPaise(charge.outstandingPaise)}. Anything already paid stays recorded.</p>}
    </ModalForm>
  );
}
