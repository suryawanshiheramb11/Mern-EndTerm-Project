import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ErrorBanner from '../ErrorBanner.jsx';
import RoomModal from './RoomModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { canWrite, PERMISSIONS } from '../../lib/permissions.js';
import { formatINR } from '../../lib/format.js';
import { deactivateRoom, listRooms } from '../../services/properties.js';

export default function RoomsTab({ propertyId }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const editable = canWrite(user, propertyId, PERMISSIONS.ROOMS_WRITE);
  const [modal, setModal] = useState(null);
  const [actionError, setActionError] = useState(null);

  const { data, isLoading, error } = useQuery({ queryKey: ['rooms', propertyId], queryFn: () => listRooms(propertyId) });

  const deactivate = async (room) => {
    if (!window.confirm(`Deactivate room ${room.number} and its beds?`)) return;
    setActionError(null);
    try {
      await deactivateRoom(propertyId, room.id);
      await Promise.all(['rooms', 'beds', 'property'].map((key) => queryClient.invalidateQueries({ queryKey: [key, propertyId] })));
    } catch (err) {
      setActionError(err);
    }
  };

  if (isLoading) return <p className="text-slate-500">Loading rooms…</p>;
  if (error) return <ErrorBanner error={error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">Rooms ({data.pagination.total})</h2>
        {editable && (
          <button type="button" onClick={() => setModal({})} className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Add room
          </button>
        )}
      </div>
      <ErrorBanner error={actionError} />

      {data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">No rooms yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Room</th>
                <th className="px-4 py-2">Floor</th>
                <th className="px-4 py-2">Capacity</th>
                <th className="px-4 py-2">Rent</th>
                <th className="px-4 py-2">Deposit</th>
                <th className="px-4 py-2">Status</th>
                {editable && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((room) => (
                <tr key={room.id} className={room.status === 'inactive' ? 'text-slate-400' : ''}>
                  <td className="px-4 py-2 font-medium">{room.number}</td>
                  <td className="px-4 py-2">{room.floor}</td>
                  <td className="px-4 py-2">{room.capacity}</td>
                  <td className="px-4 py-2">{room.defaultMonthlyRent === undefined ? '—' : formatINR(room.defaultMonthlyRent)}</td>
                  <td className="px-4 py-2">{room.defaultDeposit === undefined ? '—' : formatINR(room.defaultDeposit)}</td>
                  <td className="px-4 py-2 capitalize">{room.status}</td>
                  {editable && (
                    <td className="space-x-3 px-4 py-2 text-right">
                      <button type="button" onClick={() => setModal({ room })} className="font-medium text-slate-700 hover:underline">
                        Edit
                      </button>
                      {room.status !== 'inactive' && (
                        <button type="button" onClick={() => deactivate(room)} className="font-medium text-red-600 hover:underline">
                          Deactivate
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && <RoomModal propertyId={propertyId} room={modal.room} onClose={() => setModal(null)} />}
    </div>
  );
}
