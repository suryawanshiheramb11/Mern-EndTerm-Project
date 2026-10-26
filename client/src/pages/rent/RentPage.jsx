import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import GenerateChargesModal from '../../components/rent/GenerateChargesModal.jsx';
import RecordPaymentModal from '../../components/rent/RecordPaymentModal.jsx';
import { ChargesTable, PaymentsTable } from '../../components/rent/RentTables.jsx';
import useRentActions from '../../components/rent/useRentActions.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { canWrite, PERMISSIONS } from '../../lib/permissions.js';
import { todayISO } from '../../lib/format.js';
import { listProperties } from '../../services/properties.js';
import { invalidateRent, listCharges, listPayments, reconcileCharges } from '../../services/rent.js';

const TABS = [
  { id: 'charges', label: 'Charges' },
  { id: 'payments', label: 'Payments' },
];
const STATUSES = ['', 'pending', 'partial', 'paid', 'overdue', 'waived'];
const select = 'rounded-md border border-slate-300 bg-white px-2 py-2 text-sm';

export default function RentPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = user.role === 'owner';
  const [tab, setTab] = useState('charges');
  const [propertyId, setPropertyId] = useState('');
  const [status, setStatus] = useState('');
  const [periodKey, setPeriodKey] = useState('');
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState(null);
  const [reconcileError, setReconcileError] = useState(null);
  const { onAction, modal: actionModal, error: actionError, openReceipt } = useRentActions();

  const properties = useQuery({ queryKey: ['properties'], queryFn: listProperties });
  const activeProperty = propertyId || properties.data?.items[0]?.id || '';

  const charges = useQuery({
    queryKey: ['rent-charges', { activeProperty, status, periodKey }],
    queryFn: () => listCharges({ propertyId: activeProperty, status, periodKey }),
    enabled: Boolean(activeProperty) && tab === 'charges',
  });
  const payments = useQuery({
    queryKey: ['rent-payments', { activeProperty }],
    queryFn: () => listPayments({ propertyId: activeProperty }),
    enabled: Boolean(activeProperty) && tab === 'payments',
  });

  const mayRecord = activeProperty && canWrite(user, activeProperty, PERMISSIONS.PAYMENTS_WRITE);

  const reconcile = async () => {
    setReconcileError(null);
    try {
      const r = await reconcileCharges({ propertyId: activeProperty });
      setNotice(`Overdue check done: ${r.markedOverdue} marked overdue, ${r.reopened} reopened.`);
      await invalidateRent(queryClient);
    } catch (err) {
      setReconcileError(err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Rent</h1>
        <div className="flex flex-wrap gap-2">
          {isOwner && (
            <>
              <button type="button" onClick={reconcile} disabled={!activeProperty} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
                Check overdue
              </button>
              <button type="button" onClick={() => setModal('generate')} disabled={!activeProperty} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
                Generate charges
              </button>
            </>
          )}
          {mayRecord && (
            <button type="button" onClick={() => setModal('pay')} className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
              Record payment
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Property" value={activeProperty} onChange={(e) => setPropertyId(e.target.value)} className={select}>
          {properties.data?.items.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div role="tablist" className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${tab === t.id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'charges' && (
          <>
            <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className={select}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s ? s[0].toUpperCase() + s.slice(1) : 'All statuses'}</option>
              ))}
            </select>
            <input aria-label="Month" type="month" value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} className={select} />
          </>
        )}
      </div>

      {notice && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
      <ErrorBanner error={properties.error ?? reconcileError ?? actionError} />

      {tab === 'charges' && (
        <>
          <ErrorBanner error={charges.error} />
          {charges.isLoading ? <p className="text-slate-500">Loading…</p> : <ChargesTable items={charges.data?.items ?? []} isOwner={isOwner} onAction={onAction} />}
        </>
      )}
      {tab === 'payments' && (
        <>
          <ErrorBanner error={payments.error} />
          {payments.isLoading ? <p className="text-slate-500">Loading…</p> : <PaymentsTable items={payments.data?.items ?? []} isOwner={isOwner} onAction={onAction} />}
        </>
      )}

      {modal === 'generate' && <GenerateChargesModal propertyId={activeProperty} defaultPeriod={todayISO().slice(0, 7)} onClose={() => setModal(null)} />}
      {modal === 'pay' && (
        <RecordPaymentModal propertyId={activeProperty} onClose={() => setModal(null)} onRecorded={(payment) => { setTab('payments'); openReceipt(payment); }} />
      )}
      {actionModal}
    </div>
  );
}
