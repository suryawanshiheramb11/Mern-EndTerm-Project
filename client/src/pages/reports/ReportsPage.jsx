import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import PropertyPicker, { useActiveProperty } from '../../components/reports/PropertyPicker.jsx';
import Sparkline from '../../components/reports/Sparkline.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { hasPermission, PERMISSIONS as P } from '../../lib/permissions.js';
import { addDaysISO, formatDate, formatPaise, formatPeriod, todayISO } from '../../lib/format.js';
import { downloadExport, getCollections, getExpensesReport, getOccupancy, getOutstanding, getTrend } from '../../services/reports.js';

const TABS = ['occupancy', 'collections', 'outstanding', 'expenses', 'trend'];
// Each raw export also needs the matching read permission on the server.
const EXPORTS = [['charges', 'Charges', P.PAYMENTS_VIEW], ['payments', 'Payments', P.PAYMENTS_VIEW], ['expenses', 'Expenses', P.FINANCES_VIEW], ['residents', 'Residents', P.RESIDENTS_VIEW]];
const input = 'rounded-md border border-slate-300 bg-white px-2 py-2 text-sm';
const th = 'px-4 py-2';

function Table({ head, rows, empty = 'No data for this selection.' }) {
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{head.map((h, i) => <th key={h} className={`${th} ${i > 0 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => <tr key={r.key}>{r.cells.map((c, i) => <td key={i} className={`px-4 py-2 ${i > 0 ? 'text-right' : ''}`}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportsPage() {
  const { user } = useAuth();
  const { items } = useActiveProperty();
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState('occupancy');
  const [from, setFrom] = useState(addDaysISO(todayISO(), -29));
  const [to, setTo] = useState(todayISO());
  const [groupBy, setGroupBy] = useState('category');
  const [months, setMonths] = useState(6);
  const [exportError, setExportError] = useState(null);
  const propertyId = selected || items[0]?.id || '';
  const range = { from, to };
  const on = Boolean(propertyId);

  const occupancy = useQuery({ queryKey: ['report', 'occupancy', propertyId, from, to], queryFn: () => getOccupancy(propertyId, range), enabled: on && tab === 'occupancy' });
  const collections = useQuery({ queryKey: ['report', 'collections', propertyId, from, to], queryFn: () => getCollections(propertyId, range), enabled: on && tab === 'collections' });
  const outstanding = useQuery({ queryKey: ['report', 'outstanding', propertyId], queryFn: () => getOutstanding(propertyId), enabled: on && tab === 'outstanding' });
  const expenses = useQuery({ queryKey: ['report', 'expenses', propertyId, from, to, groupBy], queryFn: () => getExpensesReport(propertyId, { ...range, groupBy }), enabled: on && tab === 'expenses' });
  const trend = useQuery({ queryKey: ['report', 'trend', propertyId, months], queryFn: () => getTrend(propertyId, months), enabled: on && tab === 'trend' });
  const active = { occupancy, collections, outstanding, expenses, trend }[tab];

  const exportCsv = async (type) => {
    setExportError(null);
    try {
      await downloadExport(type, propertyId, range);
    } catch (err) {
      setExportError(err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Reports</h1>
        <PropertyPicker items={items} value={propertyId} onChange={setSelected} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex gap-1">
          {TABS.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md px-3 py-2 text-sm font-medium capitalize ${tab === t ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{t}</button>
          ))}
        </div>
        {tab !== 'outstanding' && tab !== 'trend' && (
          <>
            <input aria-label="From" type="date" max={to} value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
            <input aria-label="To" type="date" min={from} max={todayISO()} value={to} onChange={(e) => setTo(e.target.value)} className={input} />
          </>
        )}
        {tab === 'expenses' && (
          <select aria-label="Group by" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className={input}>
            <option value="category">By category</option>
            <option value="month">By month</option>
          </select>
        )}
        {tab === 'trend' && (
          <select aria-label="Months" value={months} onChange={(e) => setMonths(Number(e.target.value))} className={input}>
            {[3, 6, 12, 24].map((m) => <option key={m} value={m}>Last {m} months</option>)}
          </select>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Export CSV{tab !== 'outstanding' && tab !== 'trend' ? ' (uses the dates above)' : ''}:</span>
        {EXPORTS.filter(([, , perm]) => hasPermission(user, propertyId, perm)).map(([type, label]) => (
          <button key={type} type="button" disabled={!on} onClick={() => exportCsv(type)} className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-50">{label}</button>
        ))}
      </div>
      <ErrorBanner error={active.error ?? exportError} />
      {active.isLoading && <p className="text-slate-500">Loading…</p>}

      {tab === 'occupancy' && occupancy.data && (
        <>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <Sparkline label="Occupancy percent" values={occupancy.data.points.map((p) => p.occupancyPercent)} width={200} height={40} />
            <span>Bed totals are today&apos;s; older days approximate.</span>
          </div>
          <Table head={['Date', 'Occupied', 'Total beds', 'Occupancy']} rows={[...occupancy.data.points].reverse().map((p) => ({ key: p.date, cells: [formatDate(p.date), p.occupiedBeds, p.totalBeds, `${p.occupancyPercent}%`] }))} />
        </>
      )}

      {tab === 'collections' && collections.data && (
        <>
          <p className="text-sm text-slate-600">
            Months {formatPeriod(collections.data.fromPeriod)} – {formatPeriod(collections.data.toPeriod)} · charged {formatPaise(collections.data.totals.chargedPaise)} · collected {formatPaise(collections.data.totals.paidPaise)} · outstanding {formatPaise(collections.data.totals.outstandingPaise)}
          </p>
          <p className="text-xs text-slate-500">Payments count towards the month of the rent they pay, not the day they arrived. Deposits are not included.</p>
          <Table head={['Resident', 'Charged', 'Paid', 'Outstanding']} rows={collections.data.items.map((r) => ({ key: r.residentId, cells: [r.fullName ?? '—', formatPaise(r.chargedPaise), formatPaise(r.paidPaise), formatPaise(r.outstandingPaise)] }))} />
        </>
      )}

      {tab === 'outstanding' && outstanding.data && (
        <>
          <p className="text-sm text-slate-600">Total outstanding {formatPaise(outstanding.data.totalOutstandingPaise)} · by days past due: {Object.entries(outstanding.data.aging).map(([b, v]) => `${b}: ${formatPaise(v)}`).join(' · ')}</p>
          <Table head={['Resident', 'Outstanding', '0–15', '16–30', '31–60', '60+']} empty="Nobody owes rent." rows={outstanding.data.items.map((r) => ({ key: r.residentId, cells: [r.fullName ?? '—', formatPaise(r.outstandingPaise), ...['0-15', '16-30', '31-60', '60+'].map((b) => formatPaise(r.aging[b]))] }))} />
        </>
      )}

      {tab === 'expenses' && expenses.data && (
        <>
          <p className="text-sm text-slate-600">Total paid {formatPaise(expenses.data.totalPaise)} (cash basis; voided and unpaid excluded)</p>
          <Table head={[groupBy === 'month' ? 'Month' : 'Category', 'Entries', 'Total']} rows={expenses.data.items.map((r) => ({ key: r.key, cells: [groupBy === 'month' ? formatPeriod(r.key) : <span className="capitalize">{r.key}</span>, r.count, formatPaise(r.totalPaise)] }))} />
        </>
      )}

      {tab === 'trend' && trend.data && (
        <Table head={['Month', 'Charged', 'Collected', 'Outstanding', 'Expenses', 'Cash position']} rows={trend.data.months.map((m) => ({ key: m.periodKey, cells: [formatPeriod(m.periodKey), formatPaise(m.chargedPaise), formatPaise(m.collectedPaise), formatPaise(m.outstandingPaise), formatPaise(m.expensesPaise), formatPaise(m.netCashPaise)] }))} />
      )}
    </div>
  );
}
