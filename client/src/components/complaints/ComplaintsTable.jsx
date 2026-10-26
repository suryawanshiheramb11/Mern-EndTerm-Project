import { PriorityBadge, SlaBadge, StatusBadge, UrgencyBadge } from './Badges.jsx';

export default function ComplaintsTable({ items, showResident = true, onOpen }) {
  if (items.length === 0) return <p className="text-sm text-slate-500">No complaints.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-2">#</th>
            <th className="px-4 py-2">Issue</th>
            {showResident && <th className="px-4 py-2">Resident</th>}
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Urgency</th>
            <th className="px-4 py-2">Assigned</th>
            <th className="px-4 py-2">SLA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((c) => (
            <tr key={c.id} onClick={() => onOpen(c.id)} className="cursor-pointer hover:bg-slate-50">
              <td className="px-4 py-2 font-mono text-xs">{c.complaintNumber}</td>
              <td className="px-4 py-2">
                <button type="button" className="text-left font-medium text-slate-800 hover:underline" onClick={(e) => { e.stopPropagation(); onOpen(c.id); }}>{c.title}</button>
                <div className="text-xs capitalize text-slate-400">{c.category}</div>
              </td>
              {showResident && <td className="px-4 py-2">{c.resident?.fullName}<div className="text-xs text-slate-400">Room {c.room?.number}</div></td>}
              <td className="px-4 py-2"><StatusBadge status={c.status} /></td>
              <td className="space-x-1 px-4 py-2"><UrgencyBadge urgency={c.urgency} /><PriorityBadge priority={c.priority} /></td>
              <td className="px-4 py-2">{c.assignedTo?.name ?? '—'}</td>
              <td className="px-4 py-2"><SlaBadge state={c.slaState} dueAt={c.slaDueAt} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
