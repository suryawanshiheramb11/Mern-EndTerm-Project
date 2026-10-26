import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ModalForm from '../ModalForm.jsx';
import { Field } from '../AuthForm.jsx';
import { formatPaise } from '../../lib/format.js';
import { voidExpense } from '../../services/expenses.js';

export default function VoidExpenseModal({ expense, onClose }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const onSubmit = async () => {
    await voidExpense(expense.id, reason ? { reason } : {});
    await queryClient.invalidateQueries({ queryKey: ['expenses'] });
    await queryClient.invalidateQueries({ queryKey: ['report'] });
  };
  return (
    <ModalForm title="Void expense" onClose={onClose} onSubmit={onSubmit} submitLabel="Void expense">
      <p className="text-sm text-slate-600">Voids {formatPaise(expense.amountPaise)} ({expense.description}). It stays on record but disappears from lists and reports.</p>
      <Field label="Reason (optional)" minLength={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
    </ModalForm>
  );
}
