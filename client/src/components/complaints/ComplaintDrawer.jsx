import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ErrorBanner from '../ErrorBanner.jsx';
import { Field } from '../AuthForm.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { getComplaint, listAssignees, reopenAsStudent, transition } from '../../services/complaints.js';
import { PriorityBadge, SlaBadge, StatusBadge, UrgencyBadge } from './Badges.jsx';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const btn = 'rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50';
const primary = 'rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60';

function Link({ href, children }) {
  return /^https:\/\//.test(href) ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">{children}</a>
  ) : null;
}

function Timeline({ history }) {
  return (
    <ol className="space-y-3 border-l border-slate-200 pl-4">
      {history.map((h) => (
        <li key={h.id} className="relative text-sm">
          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-400" />
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={h.status} />
            {h.fromStatus && h.fromStatus !== h.status && <span className="text-xs text-slate-400">from {h.fromStatus.replace('_', ' ')}</span>}
            <span className="text-xs text-slate-500">{when(h.at)} · {h.by?.name ?? 'System'}</span>
          </div>
          {h.assignedTo && <p className="text-slate-600">Assigned to {h.assignedTo.name}</p>}
          {h.progressNote && <p className="text-slate-700">{h.progressNote}</p>}
          {h.note && <p className="text-slate-700">{h.note}</p>}
          {h.completionPhotoUrl && <p><Link href={h.completionPhotoUrl}>Photo</Link></p>}
        </li>
      ))}
    </ol>
  );
}

// Which buttons appear comes from complaint.actions (computed by the API for this user).
function Actions({ complaint, onChanged }) {
  const { user } = useAuth();
  const [mode, setMode] = useState(null);
  const [f, setF] = useState({ assignedTo: '', priority: 'medium', text: '', photo: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.value }));
  const can = (a) => complaint.actions.includes(a);

  const assignees = useQuery({
    queryKey: ['assignees', complaint.property],
    queryFn: () => listAssignees(complaint.property),
    enabled: mode === 'assign',
  });
  const people = assignees.data ?? [];
  const assignedTo = f.assignedTo || complaint.assignedTo?.id || people[0]?.id || '';

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await fn());
      setMode(null);
      setF((prev) => ({ ...prev, text: '', photo: '' }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const id = complaint.id;
  const photo = f.photo.trim();

  if (complaint.actions.length === 0) return null;
  return (
    <div className="space-y-3 border-t border-slate-200 pt-3">
      <ErrorBanner error={error} />
      <div className="flex flex-wrap gap-2">
        {can('acknowledge') && <button type="button" disabled={busy} className={primary} onClick={() => run(() => transition(id, 'acknowledge'))}>Acknowledge</button>}
        {can('assign') && <button type="button" className={btn} onClick={() => setMode('assign')}>{complaint.assignedTo ? 'Reassign' : 'Assign'}</button>}
        {can('progress') && <button type="button" className={btn} onClick={() => setMode('progress')}>Add progress</button>}
        {can('resolve') && <button type="button" className={btn} onClick={() => setMode('resolve')}>Resolve</button>}
        {can('close') && <button type="button" disabled={busy} className={primary} onClick={() => run(() => transition(id, 'close'))}>Close</button>}
        {can('reopen') && <button type="button" className={btn} onClick={() => setMode('reopen')}>Reopen</button>}
      </div>

      {mode === 'assign' && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => transition(id, 'assign', { assignedTo, priority: f.priority })); }}>
          <label className="block text-sm font-medium text-slate-700">
            Assign to
            <select value={assignedTo} onChange={set('assignedTo')} required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2">
              {people.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.role})</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Priority
            <select value={f.priority} onChange={set('priority')} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 capitalize">
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          {people.length === 0 && !assignees.isLoading && <p className="text-xs text-slate-500">No wardens or maintenance staff have access to this property.</p>}
          <button type="submit" disabled={busy || !assignedTo} className={primary}>Assign</button>
        </form>
      )}
      {mode === 'progress' && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => transition(id, 'progress', { progressNote: f.text, ...(photo && { photoUrl: photo }) })); }}>
          <Field label="Progress note" required minLength={3} maxLength={1000} value={f.text} onChange={set('text')} />
          <Field label="Photo URL (optional, https)" type="url" value={f.photo} onChange={set('photo')} />
          <button type="submit" disabled={busy} className={primary}>Save progress</button>
        </form>
      )}
      {mode === 'resolve' && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => transition(id, 'resolve', { resolutionNotes: f.text, ...(photo && { completionPhotoUrl: photo }) })); }}>
          <Field label="Resolution notes" required minLength={3} maxLength={2000} value={f.text} onChange={set('text')} />
          <Field label="Completion photo URL (optional, https)" type="url" value={f.photo} onChange={set('photo')} />
          <button type="submit" disabled={busy} className={primary}>Mark resolved</button>
        </form>
      )}
      {mode === 'reopen' && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => (user.role === 'student' || user.role === 'owner' ? reopenAsStudent : (cid, b) => transition(cid, 'reopen', b))(id, { reason: f.text })); }}>
          <Field label="Why is it being reopened?" required minLength={3} maxLength={500} value={f.text} onChange={set('text')} />
          <button type="submit" disabled={busy} className={primary}>Reopen</button>
        </form>
      )}
    </div>
  );
}

export default function ComplaintDrawer({ complaintId, onClose, onChanged }) {
  const queryClient = useQueryClient();
  const { data: complaint, error, isLoading } = useQuery({ queryKey: ['complaint', complaintId], queryFn: () => getComplaint(complaintId) });

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const changed = async (updated) => {
    queryClient.setQueryData(['complaint', complaintId], updated);
    await queryClient.invalidateQueries({ queryKey: ['complaints'] });
    onChanged?.(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside role="dialog" aria-label="Complaint details" className="h-full w-full max-w-md space-y-4 overflow-y-auto bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            {complaint && <p className="font-mono text-xs text-slate-500">{complaint.complaintNumber}</p>}
            <h2 className="text-lg font-semibold text-slate-800">{complaint?.title ?? 'Complaint'}</h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <ErrorBanner error={error} />
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        {complaint && (
          <>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={complaint.status} />
              <UrgencyBadge urgency={complaint.urgency} />
              <PriorityBadge priority={complaint.priority} />
              <SlaBadge state={complaint.slaState} dueAt={complaint.slaDueAt} />
            </div>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Resident</dt><dd>{complaint.resident?.fullName} · Room {complaint.room?.number}, Bed {complaint.bed?.label}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Category</dt><dd className="capitalize">{complaint.category}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Assigned to</dt><dd>{complaint.assignedTo?.name ?? '—'}</dd></div>
              {complaint.reopenedCount > 0 && <div className="flex justify-between"><dt className="text-slate-500">Reopened</dt><dd>{complaint.reopenedCount}×</dd></div>}
            </dl>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{complaint.description}</p>
            {complaint.attachments.length > 0 && (
              <p className="text-sm">Attachments: {complaint.attachments.map((a, i) => <span key={a.url} className="mr-2"><Link href={a.url}>Photo {i + 1}</Link></span>)}</p>
            )}
            {complaint.resolutionNotes && ['resolved', 'closed'].includes(complaint.status) && (
              <p className="rounded-md bg-green-50 p-3 text-sm text-green-900"><strong>Resolution:</strong> {complaint.resolutionNotes}</p>
            )}
            <Actions key={complaint.status + complaint.statusHistory.length} complaint={complaint} onChanged={changed} />
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">History</h3>
              <Timeline history={complaint.statusHistory} />
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
