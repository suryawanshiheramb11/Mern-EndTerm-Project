import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import PropertyPicker, { useActiveProperty } from '../../components/reports/PropertyPicker.jsx';
import Sparkline from '../../components/reports/Sparkline.jsx';
import { formatPaise, formatPeriod, todayISO } from '../../lib/format.js';
import { getOverview, getTrend } from '../../services/reports.js';

// Hovering the ⓘ shows which service produced the number (text comes from the API's `definitions`).
function Kpi({ label, value, sub, source, trend, tone }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between text-xs uppercase text-slate-500">
        <span>{label}</span>
        <span title={source} aria-label={`Source: ${source}`} className="cursor-help normal-case text-slate-400">ⓘ</span>
      </div>
      <div className={`mt-1 text-2xl font-semibold ${tone ?? 'text-slate-800'}`}>{value}</div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
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
        <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500">You have no properties yet. <Link className="underline" to="/owner/properties">Add your first property</Link>.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
        <div className="flex gap-2">
          <PropertyPicker items={items} value={propertyId} onChange={setSelected} />
          <input aria-label="Month" type="month" value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} className="rounded-md border border-slate-300 px-2 py-2 text-sm" />
        </div>
      </div>
      <ErrorBanner error={properties.error ?? overview.error ?? trend.error} />
      {overview.isLoading && <p className="text-slate-500">Loading…</p>}

      {o && (
        <>
          {o.occupancy.totalBeds === 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">No beds yet. <Link className="underline" to={`/owner/properties/${propertyId}`}>Add rooms and beds</Link> to start tracking occupancy.</p>
          )}
          {o.rent.chargedPaise === 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No charges yet for {formatPeriod(o.period)}. <Link className="underline" to="/owner/rent">Generate charges</Link>.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Occupied beds" value={`${o.occupancy.occupiedBeds}/${o.occupancy.totalBeds}`} sub={`${o.occupancy.occupancyPercent}% occupied · ${o.occupancy.availableBeds} free`} source={d.occupancy} />
            <Kpi label={`Rent collected · ${formatPeriod(o.period)}`} value={formatPaise(o.rent.collectedPaise)} sub={`${o.rent.collectionRatePercent}% of ${formatPaise(o.rent.chargedPaise)} charged`} source={d.collectedPaise} trend={<Sparkline label="Collected, last 6 months" values={series('collectedPaise')} />} tone="text-green-700" />
            <Kpi label="Rent outstanding" value={formatPaise(o.rent.outstandingPaise)} sub={formatPeriod(o.period)} source={d.outstandingPaise} trend={<Sparkline label="Outstanding, last 6 months" values={series('outstandingPaise')} />} tone={o.rent.outstandingPaise > 0 ? 'text-red-700' : undefined} />
            <Kpi label="Open complaints" value={o.complaints.open} sub={`${o.complaints.highPriority} high priority · ${o.complaints.overdue} overdue`} source={d.complaints} tone={o.complaints.highPriority > 0 ? 'text-red-700' : undefined} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label={`Expenses · ${formatPeriod(o.period)}`} value={formatPaise(o.expenses.totalPaise)} sub={o.expenses.byCategory[0] ? `Largest: ${o.expenses.byCategory[0].category}` : 'None recorded'} source={d.expensesPaise} trend={<Sparkline label="Expenses, last 6 months" values={series('expensesPaise')} />} />
            <Kpi label="Cash position" value={formatPaise(o.netCashPaise)} sub="Collected − expenses (not profit)" source={d.netCashPaise} trend={<Sparkline label="Cash position, last 6 months" values={series('netCashPaise')} />} />
            <Kpi label="Move-ins (30 days)" value={o.upcomingMoveIns.count} sub={o.upcomingMoveIns.next[0] ? `Next: ${o.upcomingMoveIns.next[0].residentName}` : 'None scheduled'} source="Stay service: reservations arriving soon" />
            <Kpi label="Move-outs (30 days)" value={o.upcomingMoveOuts.count} sub={o.upcomingMoveOuts.next[0] ? `Next: ${o.upcomingMoveOuts.next[0].residentName}` : 'None scheduled'} source="Stay service: expected check-out dates" />
          </div>

          <section className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
            <h2 className="text-sm font-semibold text-slate-700">Deposits — liabilities, not revenue</h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <Kpi label="Deposits held" value={formatPaise(o.deposits.heldPaise)} sub={`${formatPaise(o.deposits.refundsPayablePaise)} refunds still to pay`} source={d.depositsHeldPaise} />
              <Kpi label="Received this month" value={formatPaise(o.deposits.receivedThisPeriodPaise)} sub="Informational; not in rent or cash" source="Stay service: deposits on stays that began this month" />
              <Kpi label="Refunded this month" value={formatPaise(o.deposits.refundedThisPeriodPaise)} sub="Informational; not in expenses" source="Refund service: refunds marked paid this month" />
            </div>
          </section>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {ACTIONS(propertyId).map((a) => (
          <Link key={a.to + a.label} to={a.to} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">{a.label}</Link>
        ))}
      </div>
    </div>
  );
}
