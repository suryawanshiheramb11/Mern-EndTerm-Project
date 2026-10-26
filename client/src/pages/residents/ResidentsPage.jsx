import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import ResidentModal from '../../components/residents/ResidentModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import useDebounced from '../../hooks/useDebounced.js';
import { canWrite, PERMISSIONS } from '../../lib/permissions.js';
import { ROLE_HOME } from '../../lib/roles.js';
import { listProperties } from '../../services/properties.js';
import { listResidents } from '../../services/residents.js';

export default function ResidentsPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({ propertyId: '', status: 'active', q: '' });
  const [creating, setCreating] = useState(false);
  const q = useDebounced(filters.q);
  const query = { propertyId: filters.propertyId, status: filters.status, q };

  const properties = useQuery({ queryKey: ['properties'], queryFn: listProperties });
  const residents = useQuery({ queryKey: ['residents', query], queryFn: () => listResidents(query) });

  const writable = (properties.data?.items ?? []).filter((p) => canWrite(user, p.id, PERMISSIONS.RESIDENTS_WRITE));
  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Residents</h1>
        {writable.length > 0 && (
          <button type="button" onClick={() => setCreating(true)} className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Add resident
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          aria-label="Search residents"
          placeholder="Search name, phone or email"
          value={filters.q}
          onChange={set('q')}
          className="w-64 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select aria-label="Property" value={filters.propertyId} onChange={set('propertyId')} className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm">
          <option value="">All properties</option>
          {properties.data?.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select aria-label="Status" value={filters.status} onChange={set('status')} className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm">
          <option value="active">Active</option>
          <option value="former">Former</option>
          <option value="">All</option>
        </select>
      </div>

      {residents.isLoading && <p className="text-slate-500">Loading…</p>}
      <ErrorBanner error={residents.error} />

      {residents.data &&
        (residents.data.items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-500">No residents found.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Bed</th>
                  <th className="px-4 py-2">ID check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {residents.data.items.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-medium">
                      <Link to={`${ROLE_HOME[user.role]}/residents/${r.id}`} className="hover:underline">
                        {r.fullName}
                      </Link>
                      {r.status === 'former' && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">Former</span>}
                    </td>
                    <td className="px-4 py-2">{r.phone}</td>
                    <td className="px-4 py-2">{r.email ?? '—'}</td>
                    <td className="px-4 py-2">
                      {r.currentStay ? (
                        <>
                          {r.currentStay.roomNumber}-{r.currentStay.bedLabel}
                          {r.currentStay.isReservation && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">Reserved</span>}
                        </>
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-2 capitalize">{r.idVerification.status.replace('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {creating && <ResidentModal properties={writable} defaultPropertyId={filters.propertyId} onClose={() => setCreating(false)} />}
    </div>
  );
}
