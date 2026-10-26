import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ModalForm from '../ModalForm.jsx';
import ErrorBanner from '../ErrorBanner.jsx';
import { Field } from '../AuthForm.jsx';
import SelectField from '../SelectField.jsx';
import { todayISO } from '../../lib/format.js';
import { listBeds, listRooms } from '../../services/properties.js';
import { transferStay } from '../../services/residents.js';

export default function TransferModal({ stay, propertyId, onClose }) {
  const queryClient = useQueryClient();
  const rooms = useQuery({ queryKey: ['rooms', propertyId], queryFn: () => listRooms(propertyId) });
  const beds = useQuery({ queryKey: ['beds', propertyId, { status: 'available' }], queryFn: () => listBeds(propertyId, { status: 'available' }) });
  const [f, setF] = useState({ bedId: '', date: todayISO(), reason: '' });
  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.value }));

  if (rooms.isLoading || beds.isLoading) return null;

  const roomById = new Map(rooms.data?.items.map((r) => [r.id, r]));
  const options = (beds.data?.items ?? [])
    .filter((b) => b.id !== stay.bed.id && roomById.get(b.room)?.status === 'active')
    .map((b) => ({ value: b.id, label: `Room ${roomById.get(b.room).number} · Bed ${b.label}` }));
  const bedId = f.bedId || options[0]?.value || '';

  const onSubmit = async () => {
    await transferStay(stay.id, { newBedId: bedId, transferDate: f.date, ...(f.reason && { reason: f.reason }) });
    await Promise.all(['residents', 'resident', 'stays'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    await Promise.all(['beds', 'property'].map((key) => queryClient.invalidateQueries({ queryKey: [key, propertyId] })));
  };

  return (
    <ModalForm title={`Transfer from Room ${stay.room.number} · Bed ${stay.bed.label}`} onClose={onClose} onSubmit={onSubmit} submitLabel="Transfer">
      <ErrorBanner error={rooms.error ?? beds.error} />
      {options.length === 0 ? (
        <p className="text-sm text-slate-600">No other available beds in this property.</p>
      ) : (
        <>
          <SelectField label="New bed" required options={options} value={bedId} onChange={set('bedId')} />
          <Field
            label="Transfer date"
            type="date"
            required
            min={stay.checkInDate.slice(0, 10)}
            max={todayISO()}
            value={f.date}
            onChange={set('date')}
          />
          <Field label="Reason" maxLength={300} value={f.reason} onChange={set('reason')} />
          <p className="text-xs text-slate-500">
            The current stay is closed and a new one opens in the new bed. Rent follows the new bed&apos;s rate if it has one.
            The deposit and past history carry over.
          </p>
        </>
      )}
    </ModalForm>
  );
}
