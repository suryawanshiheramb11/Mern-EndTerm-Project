import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import { listNotifications, markNotificationRead } from '../../services/me.js';

const TYPE_LABEL = {
  rent_due_soon: 'Rent', rent_overdue: 'Rent', payment_recorded: 'Payment', complaint_created: 'Complaint', task_assigned: 'Task',
  complaint_resolved: 'Complaint', checkin_upcoming: 'Move-in', checkout_upcoming: 'Move-out', refund_pending: 'Refund', announcement: 'Notice',
};

// Shared by students and staff: everything shown is what the API stored, in the order it happened.
export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState(null);
  const query = useQuery({ queryKey: ['notifications', { unreadOnly }], queryFn: () => listNotifications({ unread: unreadOnly ? 'true' : undefined }) });
  const items = query.data?.items ?? [];

  const read = async (n) => {
    if (n.readAt) return;
    try {
      await markNotificationRead(n.id);
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Notifications {query.data?.unreadCount > 0 && <span className="text-sm font-normal text-slate-500">({query.data.unreadCount} unread)</span>}</h1>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> Unread only</label>
      </div>
      <ErrorBanner error={query.error ?? error} />
      {query.isLoading ? <p className="text-slate-500">Loading…</p> : items.length === 0 ? (
        <p className="text-sm text-slate-500">{unreadOnly ? 'Nothing unread.' : 'No notifications yet.'}</p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {items.map((n) => (
            <li key={n.id} className={`flex items-start justify-between gap-3 px-4 py-3 ${n.readAt ? '' : 'bg-blue-50/40'}`}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{TYPE_LABEL[n.type] ?? n.type}</span>
                  <span className={`text-sm ${n.readAt ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>{n.title}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{n.body}</p>
                <p className="mt-1 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString('en-IN')}</p>
              </div>
              <div className="flex shrink-0 gap-2 text-xs">
                {n.link && <Link to={n.link} onClick={() => read(n)} className="rounded border border-slate-300 px-2 py-1 font-medium hover:bg-slate-50">Open</Link>}
                {!n.readAt && <button type="button" onClick={() => read(n)} className="rounded border border-slate-300 px-2 py-1 font-medium hover:bg-slate-50">Mark read</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
