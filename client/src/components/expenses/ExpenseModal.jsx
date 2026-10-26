import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ModalForm from '../ModalForm.jsx';
import { Field } from '../AuthForm.jsx';
import SelectField from '../SelectField.jsx';
import { paiseToInput, parseRupeesToPaise, todayISO } from '../../lib/format.js';
import { createExpense, updateExpense } from '../../services/expenses.js';

export const CATEGORIES = ['electricity', 'water', 'internet', 'food', 'cleaning', 'repairs', 'salaries', 'maintenance', 'other'];
const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }));
const STATUS_OPTIONS = [{ value: 'paid', label: 'Paid' }, { value: 'pending', label: 'Pending' }, { value: 'scheduled', label: 'Scheduled' }];

export default function ExpenseModal({ propertyId, expense, onClose }) {
  const queryClient = useQueryClient();
  const [f, setF] = useState({
    category: expense?.category ?? 'electricity',
    amount: expense ? paiseToInput(expense.amountPaise) : '',
    paidAt: expense ? expense.paidAt.slice(0, 10) : todayISO(),
    description: expense?.description ?? '',
    vendor: expense?.vendor ?? '',
    paymentStatus: expense?.paymentStatus ?? 'paid',
    receiptUrl: expense?.receiptUrl ?? '',
    notes: expense?.notes ?? '',
  });
  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.value }));

  const onSubmit = async () => {
    const amountPaise = parseRupeesToPaise(f.amount);
    if (!amountPaise) throw new Error('Enter a valid amount (up to 2 decimals)');
    const body = {
      category: f.category, amountPaise, paidAt: f.paidAt, description: f.description, paymentStatus: f.paymentStatus,
      ...(f.vendor && { vendor: f.vendor }), ...(f.receiptUrl && { receiptUrl: f.receiptUrl }), ...(f.notes && { notes: f.notes }),
    };
    await (expense ? updateExpense(expense.id, body) : createExpense({ propertyId, ...body }));
    await queryClient.invalidateQueries({ queryKey: ['expenses'] });
    await queryClient.invalidateQueries({ queryKey: ['report'] });
  };

  return (
    <ModalForm title={expense ? 'Edit expense' : 'Add expense'} onClose={onClose} onSubmit={onSubmit} submitLabel={expense ? 'Save' : 'Add expense'}>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Category" options={CATEGORY_OPTIONS} value={f.category} onChange={set('category')} />
        <Field label="Amount (₹)" inputMode="decimal" required value={f.amount} onChange={set('amount')} />
        <Field label="Date" type="date" required value={f.paidAt} onChange={set('paidAt')} />
        <SelectField label="Status" options={STATUS_OPTIONS} value={f.paymentStatus} onChange={set('paymentStatus')} />
      </div>
      <Field label="Description" required minLength={2} maxLength={500} value={f.description} onChange={set('description')} />
      <Field label="Vendor" maxLength={120} value={f.vendor} onChange={set('vendor')} />
      <Field label="Receipt link (https, optional)" type="url" value={f.receiptUrl} onChange={set('receiptUrl')} />
      <Field label="Notes" maxLength={500} value={f.notes} onChange={set('notes')} />
      <p className="text-xs text-slate-500">Reports count an expense in the month of its date, and only once it is marked paid.</p>
    </ModalForm>
  );
}
