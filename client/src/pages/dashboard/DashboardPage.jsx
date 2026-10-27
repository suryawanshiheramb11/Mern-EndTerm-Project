import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Icon from '../../components/Icon.jsx';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import PropertyPicker, { useActiveProperty } from '../../components/reports/PropertyPicker.jsx';
import Sparkline from '../../components/reports/Sparkline.jsx';
import { formatPaise, formatPeriod, todayISO } from '../../lib/format.js';
import { getOverview, getTrend } from '../../services/reports.js';

// Hovering (or focusing) the info icon shows which service produced the number (text comes from the API's `definitions`).
// `progress` is a percentage the API already computed; this component only draws it.
function Kpi({ label, value, sub, source, trend, tone, big, progress }) {
  return (
    <div className={`card p-5 ${big ? 'lg:col-span-2' : ''}`}>
      <div className="flex items-center justify-between text-[13px] font-medium text-slate-500">
        <span>{label}</span>
        <span title={source} tabIndex={0} role="img" aria-label={`Source: ${source}`} className="cursor-help rounded-full text-slate-400 hover:text-slate-600"><Icon name="info" size={16} /></span>
      </div>
      <div className={`tnum mt-2 font-semibold leading-none tracking-tight ${big ? 'text-[40px]' : 'text-[28px]'} ${tone ?? 'text-slate-800'}`}>{value}</div>
      {progress != null && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, progress)} aria-label={`${progress}% collected`}>
          <div className="h-full rounded-full bg-green-700" style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 text-[13px] text-slate-500">
        <span>{sub}</span>
        {trend}
      </div>
    </div>
  );
}

const ACTIONS = (propertyId) => [
  { to: '/owner/residents', label: 'Add resident' },
  { to: `/owner/properties/${propertyId}`, label: 'View beds' },
  { to: '/owner/rent', label: 'Record payment' },
  { to: '/owner/reports', label: 'View reports' },
];

export default function DashboardPage() {
  const { properties, items } = useActiveProperty();
  const [selected, setSelected] = useState('');
  const [periodKey, setPeriodKey] = useState(todayISO().slice(0, 7));
  const propertyId = selected || items[0]?.id || '';

  const overview = useQuery({ queryKey: ['report', 'overview', propertyId, periodKey], queryFn: () => getOverview(propertyId, periodKey), enabled: Boolean(propertyId) && Boolean(periodKey) });
  const trend = useQuery({ queryKey: ['report', 'trend', propertyId, 6], queryFn: () => getTrend(propertyId, 6), enabled: Boolean(propertyId) });

  const o = overview.data;
  const series = (key) => trend.data?.months.map((m) => m[key]);
  const d = o?.definitions ?? {};

  if (properties.isLoading) return <p className="text-slate-500">Loading…</p>;
  if (!items.length) {
    return (
      <div className="space-y-2">
        <h1 className="page-title">Dashboard</h1>
        <p className="text-slate-500">You have no properties yet. <Link className="font-medium underline" to="/owner/properties">Add your first property</Link>.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Dashboard</h1>
        <div className="flex gap-2">
          <PropertyPicker items={items} value={propertyId} onChange={setSelected} />
          <input aria-label="Month" type="month" value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>
      <ErrorBanner error={properties.error ?? overview.error ?? trend.error} />
      {overview.isLoading && <p className="text-slate-500">Loading…</p>}

      {o && (
        <>
          {o.occupancy.totalBeds === 0 && (
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">No beds yet. <Link className="font-medium underline" to={`/owner/properties/${propertyId}`}>Add rooms and beds</Link> to start tracking occupancy.</p>
          )}
          {o.rent.chargedPaise === 0 && (
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              No charges yet for {formatPeriod(o.period)}. <Link className="font-medium underline" to="/owner/rent">Generate charges</Link>.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi big progress={o.rent.collectionRatePercent} label={`Rent collected · ${formatPeriod(o.period)}`} value={formatPaise(o.rent.collectedPaise)} sub={`${o.rent.collectionRatePercent}% of ${formatPaise(o.rent.chargedPaise)} charged`} source={d.collectedPaise} trend={<Sparkline label="Collected, last 6 months" values={series('collectedPaise')} />} />
            <Kpi label="Rent outstanding" value={formatPaise(o.rent.outstandingPaise)} sub={formatPeriod(o.period)} source={d.outstandingPaise} trend={<Sparkline label="Outstanding, last 6 months" values={series('outstandingPaise')} />} tone={o.rent.outstandingPaise > 0 ? 'text-red-700' : undefined} />
            <Kpi label="Occupied beds" value={`${o.occupancy.occupiedBeds}/${o.occupancy.totalBeds}`} sub={`${o.occupancy.occupancyPercent}% occupied · ${o.occupancy.availableBeds} free`} source={d.occupancy} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Open complaints" value={o.complaints.open} sub={`${o.complaints.highPriority} high priority · ${o.complaints.overdue} overdue`} source={d.complaints} tone={o.complaints.highPriority > 0 ? 'text-red-700' : undefined} />
            <Kpi label={`Expenses · ${formatPeriod(o.period)}`} value={formatPaise(o.expenses.totalPaise)} sub={o.expenses.byCategory[0] ? `Largest: ${o.expenses.byCategory[0].category}` : 'None recorded'} source={d.expensesPaise} trend={<Sparkline label="Expenses, last 6 months" values={series('expensesPaise')} />} />
            <Kpi label="Cash position" value={formatPaise(o.netCashPaise)} sub="Collected − expenses (not profit)" source={d.netCashPaise} trend={<Sparkline label="Cash position, last 6 months" values={series('netCashPaise')} />} />
            <Kpi label="Next 30 days" value={`${o.upcomingMoveIns.count} in · ${o.upcomingMoveOuts.count} out`} sub={o.upcomingMoveOuts.next[0] ? `Next out: ${o.upcomingMoveOuts.next[0].residentName}` : o.upcomingMoveIns.next[0] ? `Next in: ${o.upcomingMoveIns.next[0].residentName}` : 'None scheduled'} source="Stay service: reservations arriving soon and expected check-out dates" />
          </div>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-800">Deposits</h2>
              <p className="text-[13px] text-slate-500">Held on residents&apos; behalf. They are liabilities, not revenue.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Kpi label="Deposits held" value={formatPaise(o.deposits.heldPaise)} sub={`${formatPaise(o.deposits.refundsPayablePaise)} refunds still to pay`} source={d.depositsHeldPaise} />
              <Kpi label="Received this month" value={formatPaise(o.deposits.receivedThisPeriodPaise)} sub="Informational; not in rent or cash" source="Stay service: deposits on stays that began this month" />
              <Kpi label="Refunded this month" value={formatPaise(o.deposits.refundedThisPeriodPaise)} sub="Informational; not in expenses" source="Refund service: refunds marked paid this month" />
            </div>
          </section>
        </>
      )}

      <div className="flex flex-wrap gap-2" aria-label="Quick actions">
        {ACTIONS(propertyId).map((a) => (
          <Link key={a.to + a.label} to={a.to} className="card px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{a.label}</Link>
        ))}
      </div>
    </div>
  );
}
