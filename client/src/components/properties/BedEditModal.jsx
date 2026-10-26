import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ModalForm from '../ModalForm.jsx';
import { Field } from '../AuthForm.jsx';
import SelectField from '../SelectField.jsx';
import { BED_STATUS } from '../../lib/bedStatus.js';
import { optionalNumber } from '../../lib/format.js';
import { deactivateBed, updateBed } from '../../services/properties.js';

const MANUAL = ['available', 'reserved', 'maintenance', 'inactive'];

export default function BedEditModal({ propertyId, room, bed, onClose }) {
  const queryClient = useQueryClient();
  const locked = bed.status === 'occupied';
  const [f, setF] = useState({
    label: bed.label,
    status: bed.status,
    rent: bed.monthlyRent === undefined ? '' : String(bed.monthlyRent),
    notes: bed.notes ?? '',
  });
  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.value }));

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['beds', propertyId] }),
      queryClient.invalidateQueries({ queryKey: ['property', propertyId] }),
    ]);

  const onSubmit = async () => {
    const rent = optionalNumber(f.rent);
    await updateBed(propertyId, room.id, bed.id, {
      label: f.label,
      ...(!locked && f.status !== bed.status && { status: f.status }),
      monthlyRent: rent ?? null,
      notes: f.notes,
    });
    await refresh();
  };

  const onDeactivate = async () => {
    await deactivateBed(propertyId, room.id, bed.id);
    await refresh();
  };

  return (
    <ModalForm
      title={`Room ${room.number} · Bed ${bed.label}`}
      onClose={onClose}
      onSubmit={onSubmit}
      footerLeft={
        bed.status !== 'inactive' && (
          <DeactivateButton onConfirm={onDeactivate} onClose={onClose} />
        )
      }
    >
      <Field label="Label" required maxLength={5} value={f.label} onChange={set('label')} />
      {locked ? (
        <p className="text-sm text-slate-600">
          Status: <strong>Occupied</strong> — released through check-out (coming in a later phase).
        </p>
      ) : (
        <SelectField
          label="Status"
          value={f.status}
          onChange={set('status')}
          options={MANUAL.map((s) => ({ value: s, label: BED_STATUS[s].label }))}
        />
      )}
      <Field label="Rent override (₹, blank = room default)" type="number" min={0} step="0.01" value={f.rent} onChange={set('rent')} />
      <Field label="Notes" maxLength={500} value={f.notes} onChange={set('notes')} />
    </ModalForm>
  );
}

function DeactivateButton({ onConfirm, onClose }) {
  const [error, setError] = useState('');
  const click = async () => {
    if (!window.confirm('Deactivate this bed?')) return;
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div>
      <button type="button" onClick={click} className="text-sm font-medium text-red-600 hover:underline">
        Deactivate
      </button>
      {error && <p className="mt-1 max-w-[12rem] text-xs text-red-600">{error}</p>}
    </div>
  );
}
