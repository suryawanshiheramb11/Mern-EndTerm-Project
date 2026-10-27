import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ErrorBanner from '../ErrorBanner.jsx';
import Modal from '../Modal.jsx';
import SelectField from '../SelectField.jsx';
import AssignBedModal from '../residents/AssignBedModal.jsx';
import { listResidents } from '../../services/residents.js';

// Step 1 of assigning from the bed grid: pick who is moving in, then reuse the stay form with this bed preselected.
export default function AssignToBedModal({ propertyId, bed, room, takenResidentIds, onClose, onAssigned }) {
  const [resident, setResident] = useState(null);
  const [choice, setChoice] = useState('');
  const residents = useQuery({
    queryKey: ['residents', { propertyId, status: 'active' }],
    queryFn: () => listResidents({ propertyId, status: 'active' }),
  });

  if (resident) {
    return <AssignBedModal resident={resident} initialBedId={bed.id} onClose={onClose} onAssigned={onAssigned} />;
  }

  const free = (residents.data?.items ?? []).filter((r) => !takenResidentIds.has(r.id));
  const selected = choice || free[0]?.id || '';
  return (
    <Modal title={`Assign Room ${room.number} · Bed ${bed.label}`} onClose={onClose}>
      <div className="space-y-4">
        <ErrorBanner error={residents.error} />
        {residents.isLoading ? (
          <p className="text-sm text-slate-500">Loading residents…</p>
        ) : free.length === 0 ? (
          <p className="text-sm text-slate-600">Every active resident already has a bed. Add a resident first, from the Residents page.</p>
        ) : (
          <>
            <SelectField label="Resident" options={free.map((r) => ({ value: r.id, label: r.fullName }))} value={selected} onChange={(e) => setChoice(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">Cancel</button>
              <button type="button" onClick={() => setResident(free.find((r) => r.id === selected))} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-hover">Continue</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
