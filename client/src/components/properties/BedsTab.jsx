import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ErrorBanner from '../ErrorBanner.jsx';
import AddBedsModal from './AddBedsModal.jsx';
import BedEditModal from './BedEditModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { BED_STATUS } from '../../lib/bedStatus.js';
import { canWrite, PERMISSIONS } from '../../lib/permissions.js';
import { listBeds, listRooms } from '../../services/properties.js';
import { listStays } from '../../services/residents.js';

// Keeps the grid current when other staff check residents in or out.
const LIVE_REFRESH_MS = 30_000;

export default function BedsTab({ propertyId }) {
  const { user } = useAuth();
  const editable = canWrite(user, propertyId, PERMISSIONS.BEDS_WRITE);
  const [filters, setFilters] = useState({ status: '' });
  const [adding, setAdding] = useState(null);
  const [editing, setEditing] = useState(null);

  const rooms = useQuery({ queryKey: ['rooms', propertyId], queryFn: () => listRooms(propertyId) });
  const beds = useQuery({ queryKey: ['beds', propertyId, filters], queryFn: () => listBeds(propertyId, filters), refetchInterval: LIVE_REFRESH_MS });
  // Maintenance can't read stays; everyone else gets resident names on occupied beds.
  const stays = useQuery({
    queryKey: ['stays', { propertyId, status: 'active' }],
    queryFn: () => listStays({ propertyId, status: 'active' }),
    enabled: user.role !== 'maintenance',
    refetchInterval: LIVE_REFRESH_MS,
  });
  const occupant = new Map((stays.data?.items ?? []).map((s) => [s.bed.id, s.resident.fullName]));

  if (rooms.isLoading || beds.isLoading) return <p className="text-slate-500">Loading beds…</p>;
  const error = rooms.error ?? beds.error;
  if (error) return <ErrorBanner error={error} />;

  const bedsByRoom = new Map();
  for (const bed of beds.data.items) bedsByRoom.set(bed.room, [...(bedsByRoom.get(bed.room) ?? []), bed]);
  const visibleRooms = rooms.data.items.filter((r) => bedsByRoom.has(r.id) || (!filters.status && r.status !== 'inactive'));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {Object.entries(BED_STATUS).map(([key, s]) => (
            <span key={key} className="flex items-center gap-1.5 text-slate-600">
              <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
              {s.label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Filter by status"
            value={filters.status}
            onChange={(e) => setFilters({ status: e.target.value })}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            {Object.entries(BED_STATUS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </select>
          {editable && (
            <button type="button" onClick={() => setAdding({})} className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-onaccent hover:bg-accent-hover">
              Add beds
            </button>
          )}
        </div>
      </div>

      {visibleRooms.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
          {rooms.data.items.length === 0 ? 'Add a room first, then add beds to it.' : 'No beds match.'}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleRooms.map((room) => {
            const roomBeds = bedsByRoom.get(room.id) ?? [];
            return (
              <section key={room.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <header className="mb-3 flex items-baseline justify-between">
                  <h3 className="font-semibold text-slate-800">Room {room.number}</h3>
                  <span className="text-xs text-slate-500">
                    Floor {room.floor} · {roomBeds.filter((b) => b.status !== 'inactive').length}/{room.capacity} beds
                  </span>
                </header>
                <div className="flex flex-wrap gap-2">
                  {roomBeds.map((bed) => {
                    const s = BED_STATUS[bed.status];
                    const className = `flex h-12 w-12 flex-col items-center justify-center rounded-md border text-sm font-semibold ${s.chip}`;
                    return editable ? (
                      <button key={bed.id} type="button" title={`${bed.label} · ${s.label}${occupant.has(bed.id) ? ` · ${occupant.get(bed.id)}` : ''}`} onClick={() => setEditing({ room, bed })} className={`${className} hover:ring-2 hover:ring-slate-400`}>
                        {bed.label}
                        <span className="text-[9px] font-normal">{s.label.slice(0, 5)}</span>
                      </button>
                    ) : (
                      <div key={bed.id} title={`${bed.label} · ${s.label}${occupant.has(bed.id) ? ` · ${occupant.get(bed.id)}` : ''}`} className={className}>
                        {bed.label}
                        <span className="text-[9px] font-normal">{s.label.slice(0, 5)}</span>
                      </div>
                    );
                  })}
                  {editable && room.status !== 'inactive' && roomBeds.length < room.capacity && (
                    <button type="button" aria-label={`Add beds to room ${room.number}`} onClick={() => setAdding({ roomId: room.id })} className="h-12 w-12 rounded-md border border-dashed border-slate-300 text-xl text-slate-400 hover:bg-slate-50">
                      +
                    </button>
                  )}
                  {roomBeds.length === 0 && !editable && <span className="text-sm text-slate-400">No beds</span>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {adding && <AddBedsModal propertyId={propertyId} rooms={rooms.data.items} initialRoomId={adding.roomId} onClose={() => setAdding(null)} />}
      {editing && <BedEditModal propertyId={propertyId} room={editing.room} bed={editing.bed} onClose={() => setEditing(null)} />}
    </div>
  );
}
