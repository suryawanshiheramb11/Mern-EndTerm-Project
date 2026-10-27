import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import ExpenseModal, { CATEGORIES } from '../../components/expenses/ExpenseModal.jsx';
import VoidExpenseModal from '../../components/expenses/VoidExpenseModal.jsx';
import PropertyPicker, { useActiveProperty } from '../../components/reports/PropertyPicker.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatDate, formatPaise } from '../../lib/format.js';
import { hasPermission, PERMISSIONS } from '../../lib/permissions.js';
import { listExpenses } from '../../services/expenses.js';

const input = 'rounded-md border border-slate-300 bg-white px-2 py-2 text-sm';
const STATUS_STYLE = { paid: 'bg-green-50 text-green-700', pending: 'bg-amber-50 text-amber-800', scheduled: 'bg-blue-50 text-blue-700' };

export default function ExpensesPage() {
  const { user } = useAuth();
  const { items: properties } = useActiveProperty();
  const [selected, setSelected] = useState('');
  const [f, setF] = useState({ category: '', from: '', to: '', includeVoided: false });
  const [modal, setModal] = useState(null);
  const propertyId = selected || properties[0]?.id || '';
  const canEdit = hasPermission(user, propertyId, PERMISSIONS.FINANCES_EDIT);
  const canVoid = user.role === 'owner'; // voiding is owner-only on the server
  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const query = { propertyId, category: f.category, from: f.from, to: f.to, includeVoided: f.includeVoided ? 'true' : '' };
  const expenses = useQuery({ queryKey: ['expenses', query], queryFn: () => listExpenses(query), enabled: Boolean(propertyId) });
  const rows = expenses.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Expenses</h1>
        <div className="flex gap-2">
          <PropertyPicker items={properties} value={propertyId} onChange={setSelected} />
          {canEdit && <button type="button" disabled={!propertyId} onClick={() => setModal({ type: 'edit' })} className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-onaccent hover:bg-accent-hover disabled:opacity-50">Add expense</button>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Category" value={f.category} onChange={set('category')} className={input}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input aria-label="From" type="date" value={f.from} max={f.to || undefined} onChange={set('from')} className={input} />
        <input aria-label="To" type="date" value={f.to} min={f.from || undefined} onChange={set('to')} className={input} />
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={f.includeVoided} onChange={set('includeVoided')} /> Show voided</label>
      </div>

      <ErrorBanner error={expenses.error} />
      {expenses.isLoading ? <p className="text-slate-500">Loading…</p> : rows.length === 0 ? (
        <p className="text-sm text-slate-500">No expenses for this selection.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-500">
              <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Category</th><th className="px-4 py-2">Description</th><th className="px-4 py-2">Vendor</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((e) => (
                <tr key={e.id} className={e.isVoided ? 'text-slate-400 line-through' : undefined}>
                  <td className="px-4 py-2">{formatDate(e.paidAt)}</td>
                  <td className="px-4 py-2 capitalize">{e.category}</td>
                  <td className="px-4 py-2">{e.description}</td>
                  <td className="px-4 py-2">{e.vendor ?? '—'}</td>
                  <td className="px-4 py-2">{e.isVoided ? <span className="text-xs no-underline">Voided</span> : <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[e.paymentStatus]}`}>{e.paymentStatus}</span>}</td>
                  <td className="px-4 py-2 text-right">{formatPaise(e.amountPaise)}</td>
                  <td className="space-x-1 whitespace-nowrap px-4 py-2 text-right">
                    {!e.isVoided && (
                      <>
                        {canEdit && <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50" onClick={() => setModal({ type: 'edit', expense: e })}>Edit</button>}
                        {canVoid && <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50" onClick={() => setModal({ type: 'void', expense: e })}>Void</button>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal?.type === 'edit' && <ExpenseModal propertyId={propertyId} expense={modal.expense} onClose={() => setModal(null)} />}
      {modal?.type === 'void' && <VoidExpenseModal expense={modal.expense} onClose={() => setModal(null)} />}
    </div>
  );
}
