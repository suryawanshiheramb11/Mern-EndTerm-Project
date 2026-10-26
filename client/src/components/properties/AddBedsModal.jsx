import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ModalForm from '../ModalForm.jsx';
import { Field } from '../AuthForm.jsx';
import SelectField from '../SelectField.jsx';
import { optionalNumber, splitList } from '../../lib/format.js';
import { createBeds } from '../../services/properties.js';

export default function AddBedsModal({ propertyId, rooms, initialRoomId, onClose }) {
  const queryClient = useQueryClient();
  const usable = rooms.filter((r) => r.status !== 'inactive');
  const [f, setF] = useState({ roomId: initialRoomId ?? usable[0]?.id ?? '', count: '1', labels: '', rent: '' });
  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.value }));
  const room = usable.find((r) => r.id === f.roomId);

  const onSubmit = async () => {
    const labels = splitList(f.labels);
    await createBeds(propertyId, f.roomId, {
      count: labels.length || Number(f.count),
      ...(labels.length && { labels }),
      monthlyRent: optionalNumber(f.rent),
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['beds', propertyId] }),
      queryClient.invalidateQueries({ queryKey: ['property', propertyId] }),
    ]);
  };

  return (
    <ModalForm title="Add beds" onClose={onClose} onSubmit={onSubmit} submitLabel="Add beds">
      <SelectField
        label="Room"
        required
        value={f.roomId}
        onChange={set('roomId')}
        options={usable.map((r) => ({ value: r.id, label: `Room ${r.number} (capacity ${r.capacity})` }))}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Number of beds" type="number" min={1} max={100} value={f.count} onChange={set('count')} disabled={!!f.labels.trim()} />
        <Field label="Rent override (₹)" type="number" min={0} step="0.01" value={f.rent} onChange={set('rent')} />
      </div>
      <Field label="Custom labels (optional)" placeholder="A, B, C, D" value={f.labels} onChange={set('labels')} />
      <p className="text-xs text-slate-500">
        Leave labels empty to auto-name beds A, B, C…{room ? ` Room ${room.number} holds at most ${room.capacity} beds.` : ''}
      </p>
    </ModalForm>
  );
}
