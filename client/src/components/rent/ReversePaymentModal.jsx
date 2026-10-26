import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ModalForm from '../ModalForm.jsx';
import { Field } from '../AuthForm.jsx';
import { formatPaise } from '../../lib/format.js';
import { invalidateRent, reversePayment } from '../../services/rent.js';

export default function ReversePaymentModal({ payment, onClose }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const onSubmit = async () => {
    await reversePayment(payment.id, { reason });
    await invalidateRent(queryClient);
  };

  return (
    <ModalForm title={`Reverse receipt ${payment.receiptNumber}`} onClose={onClose} onSubmit={onSubmit} submitLabel="Reverse payment">
      <p className="text-sm text-slate-600">
        This books a reversal of {formatPaise(payment.amountPaise)} and reopens the charges it paid. The original payment stays on record.
      </p>
      <Field label="Reason" required minLength={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
    </ModalForm>
  );
}
