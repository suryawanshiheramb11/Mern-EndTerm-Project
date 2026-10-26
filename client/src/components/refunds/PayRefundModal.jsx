import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ModalForm from '../ModalForm.jsx';
import { Field } from '../AuthForm.jsx';
import SelectField from '../SelectField.jsx';
import { formatPaise, todayISO } from '../../lib/format.js';
import { payRefund } from '../../services/refunds.js';

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank transfer' },
];

export default function PayRefundModal({ refund, onClose }) {
  const queryClient = useQueryClient();
  const [f, setF] = useState({ method: 'cash', reference: '', paidAt: todayISO() });
  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.value }));

  const onSubmit = async () => {
    await payRefund(refund.id, { method: f.method, paidAt: f.paidAt, ...(f.reference && { reference: f.reference }) });
    await queryClient.invalidateQueries({ queryKey: ['refunds'] });
  };

  return (
    <ModalForm title={`Mark ${formatPaise(refund.refundablePaise)} refund as paid`} onClose={onClose} onSubmit={onSubmit} submitLabel="Mark as paid">
      <p className="text-sm text-slate-600">Only confirm once the money has actually been handed over or transferred.</p>
      <SelectField label="Method" options={METHODS} value={f.method} onChange={set('method')} />
      <Field label={f.method === 'cash' ? 'Reference (optional)' : 'Reference (UTR / txn id)'} required={f.method !== 'cash'} maxLength={100} value={f.reference} onChange={set('reference')} />
      <Field label="Paid on" type="date" max={todayISO()} required value={f.paidAt} onChange={set('paidAt')} />
    </ModalForm>
  );
}
