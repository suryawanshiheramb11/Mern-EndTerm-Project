import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import { formatDate, formatPaise, formatPeriod } from '../../lib/format.js';
import { getSummary } from '../../services/me.js';

function Card({ label, children, tone }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${tone ?? 'text-slate-800'}`}>{children}</div>
    </div>
  );
}

// Every figure is computed by the API (/api/me/summary); this page only displays it.
export default function StudentDashboard() {
  const { data: s, error, isLoading } = useQuery({ queryKey: ['me', 'summary'], queryFn: getSummary });
  if (isLoading) return <p className="text-slate-500">Loading…</p>;
  if (error) return <ErrorBanner error={error} />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Welcome</h1>
      {s.latestNotice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <div className="font-semibold">{s.latestNotice.title}</div>
          <p className="mt-1">{s.latestNotice.body}</p>
          <p className="mt-1 text-xs text-blue-700">{new Date(s.latestNotice.createdAt).toLocaleDateString('en-IN')}</p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card label="My room">
          {s.stay ? (
            <>
              Room {s.stay.room.number} · Bed {s.stay.bed.label}
              <div className="mt-1 text-sm font-normal text-slate-500">{s.stay.property.name} · since {formatDate(s.stay.checkInDate)}{s.stay.expectedCheckOutDate ? ` · until ${formatDate(s.stay.expectedCheckOutDate)}` : ''}</div>
            </>
          ) : <span className="text-slate-500">No active stay</span>}
        </Card>
        <Card label="Next rent due" tone={s.nextDue?.status === 'overdue' ? 'text-red-700' : undefined}>
          {s.nextDue ? (
            <>
              {formatPaise(s.nextDue.outstandingPaise)}
              <div className="mt-1 text-sm font-normal text-slate-500">{formatPeriod(s.nextDue.periodKey)} · due {formatDate(s.nextDue.dueDate)}{s.nextDue.status === 'overdue' ? ' · overdue' : ''}</div>
            </>
          ) : <span className="text-green-700">All paid up</span>}
        </Card>
        <Card label="Total outstanding" tone={s.outstandingPaise > 0 ? 'text-red-700' : 'text-green-700'}>
          {formatPaise(s.outstandingPaise)}
          {s.overduePaise > 0 && <div className="mt-1 text-sm font-normal text-red-600">{formatPaise(s.overduePaise)} overdue</div>}
        </Card>
        <Card label="Security deposit held">
          {formatPaise(s.depositHeldPaise)}
          <div className="mt-1 text-sm font-normal text-slate-500">Refundable on check-out, separate from rent</div>
        </Card>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link to="/student/rent" className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium hover:bg-slate-50">Rent &amp; receipts</Link>
        <Link to="/student/complaints" className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium hover:bg-slate-50">Complaints ({s.openComplaints} open)</Link>
        <Link to="/student/notifications" className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium hover:bg-slate-50">Notifications ({s.unreadNotifications} unread)</Link>
      </div>
    </div>
  );
}
