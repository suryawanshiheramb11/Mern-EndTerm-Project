import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ModalForm from '../ModalForm.jsx';
import { Field } from '../AuthForm.jsx';
import SelectField from '../SelectField.jsx';
import { optionalNumber } from '../../lib/format.js';
import { createRoom, updateRoom } from '../../services/properties.js';

const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'inactive', label: 'Inactive' },
];

const str = (v) => (v === undefined || v === null ? '' : String(v));

// Pass `room` to edit; omit it to create.
export default function RoomModal({ propertyId, room, onClose }) {
  const queryClient = useQueryClient();
  const [f, setF] = useState({
    number: room?.number ?? '',
    floor: str(room?.floor ?? 0),
    capacity: str(room?.capacity ?? 4),
    rent: str(room?.defaultMonthlyRent),
    deposit: str(room?.defaultDeposit),
    status: room?.status ?? 'active',
  });
  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.value }));

  const onSubmit = async () => {
    const body = {
      number: f.number,
      floor: Number(f.floor),
      capacity: Number(f.capacity),
      defaultMonthlyRent: optionalNumber(f.rent),
      defaultDeposit: optionalNumber(f.deposit),
    };
    if (room) await updateRoom(propertyId, room.id, { ...body, status: f.status });
    else await createRoom(propertyId, body);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['rooms', propertyId] }),
      queryClient.invalidateQueries({ queryKey: ['beds', propertyId] }),
      queryClient.invalidateQueries({ queryKey: ['property', propertyId] }),
    ]);
  };

  return (
    <ModalForm title={room ? `Edit room ${room.number}` : 'Add room'} onClose={onClose} onSubmit={onSubmit} submitLabel={room ? 'Save' : 'Add room'}>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Number" required maxLength={10} value={f.number} onChange={set('number')} />
        <Field label="Floor" type="number" required value={f.floor} onChange={set('floor')} />
        <Field label="Capacity" type="number" min={1} required value={f.capacity} onChange={set('capacity')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monthly rent (₹)" type="number" min={0} step="0.01" value={f.rent} onChange={set('rent')} />
        <Field label="Deposit (₹)" type="number" min={0} step="0.01" value={f.deposit} onChange={set('deposit')} />
      </div>
      {room && <SelectField label="Status" options={STATUSES} value={f.status} onChange={set('status')} />}
    </ModalForm>
  );
}
