import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ErrorBanner from '../ErrorBanner.jsx';
import { AnnouncementModal, CreateStaffLoginModal, EditStaffModal, InviteStaffModal, ResetStaffPasswordModal } from './StaffModals.jsx';
import { PERMISSION_OPTIONS } from '../../lib/permissions.js';
import { listStaff, revokeStaff } from '../../services/staff.js';

const LABEL = Object.fromEntries(PERMISSION_OPTIONS.map((o) => [o.value, o.label]));
const STATUS = { active: 'bg-green-50 text-green-700', invited: 'bg-amber-50 text-amber-800', suspended: 'bg-red-50 text-red-700' };

export default function StaffTab({ propertyId }) {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null);
  const [error, setError] = useState(null);
  const staff = useQuery({ queryKey: ['staff', propertyId], queryFn: () => listStaff(propertyId) });

  const revoke = async (member) => {
    if (!window.confirm(`Remove ${member.name}'s access to this property? Their account is kept.`)) return;
    setError(null);
    try {
      await revokeStaff(propertyId, member.id);
      await queryClient.invalidateQueries({ queryKey: ['staff', propertyId] });
    } catch (err) {
      setError(err);
    }
  };

  const rows = staff.data ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setModal({ type: 'announce' })} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Send announcement</button>
        <button type="button" onClick={() => setModal({ type: 'invite' })} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Invite by email</button>
        <button type="button" onClick={() => setModal({ type: 'create' })} className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-onaccent hover:bg-accent-hover">Create login</button>
      </div>
      <ErrorBanner error={staff.error ?? error} />
      {staff.isLoading ? <p className="text-slate-500">Loading…</p> : rows.length === 0 ? (
        <p className="text-sm text-slate-500">No staff yet. Invite a warden or maintenance person and choose exactly what they can do.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-500"><tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Permissions</th><th className="px-4 py-2">Status</th><th className="px-4 py-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2">{m.name}<div className="text-xs text-slate-400">{m.email}</div></td>
                  <td className="px-4 py-2 capitalize">{m.role}</td>
                  <td className="px-4 py-2 text-xs text-slate-600">{m.permissions.length ? m.permissions.map((p) => LABEL[p] ?? p).join(', ') : 'None (can only see inventory)'}</td>
                  <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS[m.status]}`}>{m.status}</span></td>
                  <td className="space-x-1 whitespace-nowrap px-4 py-2 text-right">
                    <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50" onClick={() => setModal({ type: 'edit', member: m })}>Edit access</button>
                    <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50" onClick={() => setModal({ type: 'reset', member: m })}>Reset password</button>
                    <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50" onClick={() => revoke(m)}>Revoke</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal?.type === 'create' && <CreateStaffLoginModal propertyId={propertyId} onClose={() => setModal(null)} />}
      {modal?.type === 'reset' && <ResetStaffPasswordModal propertyId={propertyId} member={modal.member} onClose={() => setModal(null)} />}
      {modal?.type === 'invite' && <InviteStaffModal propertyId={propertyId} onClose={() => setModal(null)} />}
      {modal?.type === 'edit' && <EditStaffModal propertyId={propertyId} member={modal.member} onClose={() => setModal(null)} />}
      {modal?.type === 'announce' && <AnnouncementModal propertyId={propertyId} onClose={() => setModal(null)} />}
    </div>
  );
}
