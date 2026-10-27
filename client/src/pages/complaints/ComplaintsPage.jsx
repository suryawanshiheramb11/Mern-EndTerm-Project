import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ComplaintDrawer from '../../components/complaints/ComplaintDrawer.jsx';
import ComplaintsTable from '../../components/complaints/ComplaintsTable.jsx';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { listComplaints } from '../../services/complaints.js';
import { listProperties } from '../../services/properties.js';

const select = 'rounded-md border border-slate-300 bg-white px-2 py-2 text-sm';
const STATUSES = ['', 'new', 'acknowledged', 'assigned', 'in_progress', 'resolved', 'closed', 'reopened'];
const PRIORITIES = ['', 'urgent', 'high', 'medium', 'low'];

// Inbox for owners/wardens; for maintenance the server already limits it to their own tasks.
export default function ComplaintsPage() {
  const { user } = useAuth();
  const tasks = user.role === 'maintenance';
  const [f, setF] = useState({ propertyId: '', status: '', priority: '', overdueOnly: false });
  const [openId, setOpenId] = useState(null);
  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const properties = useQuery({ queryKey: ['properties'], queryFn: listProperties });
  const query = { propertyId: f.propertyId, status: f.status, priority: f.priority, overdueOnly: f.overdueOnly ? 'true' : '' };
  const complaints = useQuery({ queryKey: ['complaints', query], queryFn: () => listComplaints(query) });

  return (
    <div className="space-y-4">
      <h1 className="page-title">{tasks ? 'My tasks' : 'Complaints'}</h1>
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Property" value={f.propertyId} onChange={set('propertyId')} className={select}>
          <option value="">All properties</option>
          {properties.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label="Status" value={f.status} onChange={set('status')} className={select}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? s.replace('_', ' ') : 'All statuses'}</option>)}
        </select>
        <select aria-label="Priority" value={f.priority} onChange={set('priority')} className={select}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p || 'Any priority'}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={f.overdueOnly} onChange={set('overdueOnly')} /> Overdue only
        </label>
      </div>
      <ErrorBanner error={complaints.error} />
      {complaints.isLoading ? <p className="text-slate-500">Loading…</p> : <ComplaintsTable items={complaints.data?.items ?? []} onOpen={setOpenId} />}
      {openId && <ComplaintDrawer complaintId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
