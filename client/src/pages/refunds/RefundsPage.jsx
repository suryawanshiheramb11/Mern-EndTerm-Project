import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import PayRefundModal from '../../components/refunds/PayRefundModal.jsx';
import RefundsTable from '../../components/refunds/RefundsTable.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { listProperties } from '../../services/properties.js';
import { approveRefund, cancelRefund, listRefunds } from '../../services/refunds.js';

const select = 'rounded-md border border-slate-300 bg-white px-2 py-2 text-sm';
const STATUSES = [
  ['', 'All statuses'],
  ['pending_approval', 'Pending approval'],
  ['approved', 'Approved'],
  ['paid', 'Paid'],
  ['cancelled', 'Cancelled'],
];

export default function RefundsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [propertyId, setPropertyId] = useState('');
  const [status, setStatus] = useState('');
  const [paying, setPaying] = useState(null);
  const [error, setError] = useState(null);

  const properties = useQuery({ queryKey: ['properties'], queryFn: listProperties });
  const refunds = useQuery({ queryKey: ['refunds', { propertyId, status }], queryFn: () => listRefunds({ propertyId, status }) });

  const onAction = async ({ type, refund }) => {
    setError(null);
    if (type === 'pay') return setPaying(refund);
    if (type === 'cancel' && !window.confirm('Cancel this refund? The deposit will not be returned through StayOS.')) return undefined;
    try {
      await (type === 'approve' ? approveRefund : cancelRefund)(refund.id);
      await queryClient.invalidateQueries({ queryKey: ['refunds'] });
    } catch (err) {
      setError(err);
      await queryClient.invalidateQueries({ queryKey: ['refunds'] }); // show the status that won
    }
    return undefined;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Refunds</h1>
      <div className="flex flex-wrap gap-3">
        <select aria-label="Property" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={select}>
          <option value="">All properties</option>
          {properties.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className={select}>
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <ErrorBanner error={error ?? refunds.error} />
      {refunds.isLoading ? <p className="text-slate-500">Loading…</p> : <RefundsTable items={refunds.data?.items ?? []} isOwner={user.role === 'owner'} onAction={onAction} />}
      {paying && <PayRefundModal refund={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}
