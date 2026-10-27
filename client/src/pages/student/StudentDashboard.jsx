import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Icon from '../../components/Icon.jsx';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatDate, formatPaise, formatPeriod } from '../../lib/format.js';
import { getSummary } from '../../services/me.js';

// iOS-style inset list: label left, value right.
function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-3 text-[15px]">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{children}</dd>
    </div>
  );
}

// Every figure is computed by the API (/api/me/summary); this page only displays it.
export default function StudentDashboard() {
  const { user } = useAuth();
  const { data: s, error, isLoading } = useQuery({ queryKey: ['me', 'summary'], queryFn: getSummary });
  if (isLoading) return <p className="text-slate-500">Loading…</p>;
  if (error) return <ErrorBanner error={error} />;

  const first = (user.name ?? '').split(' ')[0];
  const overdue = s.nextDue?.status === 'overdue';

  return (
    <div className="space-y-6">
      <h1 className="page-title text-[28px]">{first ? `Hi, ${first}` : 'Welcome'}</h1>

      {s.latestNotice && (
        <div className="flex gap-3 rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
          <Icon name="info" className="mt-0.5 text-blue-700" />
          <div>
            <div className="font-semibold">{s.latestNotice.title}</div>
            <p className="mt-0.5">{s.latestNotice.body}</p>
            <p className="mt-1 text-xs text-blue-700">{new Date(s.latestNotice.createdAt).toLocaleDateString('en-IN')}</p>
          </div>
        </div>
      )}

      <section aria-label="Rent" className="card p-6">
        <div className="text-[13px] font-medium text-slate-500">{s.nextDue ? 'Next rent due' : 'Rent'}</div>
        {s.nextDue ? (
          <>
            <div className={`tnum mt-2 text-[40px] font-semibold leading-none tracking-tight ${overdue ? 'text-red-700' : 'text-slate-800'}`}>{formatPaise(s.nextDue.outstandingPaise)}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>{formatPeriod(s.nextDue.periodKey)} · due {formatDate(s.nextDue.dueDate)}</span>
              {overdue && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Overdue</span>}
            </div>
            {s.outstandingPaise > s.nextDue.outstandingPaise && (
              <p className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-500">Total outstanding <span className="tnum font-medium text-slate-800">{formatPaise(s.outstandingPaise)}</span>{s.overduePaise > 0 && s.overduePaise < s.outstandingPaise && <> · <span className="text-red-700">{formatPaise(s.overduePaise)} overdue</span></>}</p>
            )}
          </>
        ) : (
          <div className="mt-2 flex items-center gap-2 text-[28px] font-semibold tracking-tight text-green-700"><Icon name="check" size={28} /> All paid up</div>
        )}
        <Link to="/student/rent" className="mt-4 inline-block text-sm font-medium text-accent-ink hover:underline">Rent history and receipts</Link>
      </section>

      <section aria-label="My stay" className="space-y-2">
        <h2 className="px-1 text-[13px] font-medium text-slate-500">My stay</h2>
        <dl className="card divide-y divide-slate-200">
          {s.stay ? (
            <>
              <Row label="Property">{s.stay.property.name}</Row>
              <Row label="Room and bed">Room {s.stay.room.number} · Bed {s.stay.bed.label}</Row>
              <Row label="Since">{formatDate(s.stay.checkInDate)}</Row>
              {s.stay.expectedCheckOutDate && <Row label="Until">{formatDate(s.stay.expectedCheckOutDate)}</Row>}
            </>
          ) : <Row label="Status">No active stay</Row>}
          <Row label="Security deposit held"><span className="tnum">{formatPaise(s.depositHeldPaise)}</span></Row>
        </dl>
        <p className="px-1 text-xs text-slate-500">The deposit is refundable on check-out and is separate from rent.</p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/student/complaints" className="card flex items-center justify-between px-5 py-4 text-[15px] font-medium text-slate-800 hover:bg-slate-50">
          <span>Complaints</span><span className="text-sm font-normal text-slate-500">{s.openComplaints} open</span>
        </Link>
        <Link to="/student/notifications" className="card flex items-center justify-between px-5 py-4 text-[15px] font-medium text-slate-800 hover:bg-slate-50">
          <span>Notifications</span><span className="text-sm font-normal text-slate-500">{s.unreadNotifications} unread</span>
        </Link>
      </div>
    </div>
  );
}
