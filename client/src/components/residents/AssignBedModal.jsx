import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ModalForm from '../ModalForm.jsx';
import ErrorBanner from '../ErrorBanner.jsx';
import { Field } from '../AuthForm.jsx';
import SelectField from '../SelectField.jsx';
import { addDaysISO, formatINR, optionalNumber, todayISO, toPaise } from '../../lib/format.js';
import { listBeds, listRooms } from '../../services/properties.js';
import { createStay } from '../../services/residents.js';

const ACTIONS = [
  { value: 'checkin', label: 'Check in now' },
  { value: 'reserve', label: 'Reserve for a future date' },
];

export default function AssignBedModal({ resident, initialBedId, onClose, onInvite, onAssigned }) {
  const queryClient = useQueryClient();
  const propertyId = resident.property;
  const rooms = useQuery({ queryKey: ['rooms', propertyId], queryFn: () => listRooms(propertyId) });
  const beds = useQuery({ queryKey: ['beds', propertyId, { status: 'available' }], queryFn: () => listBeds(propertyId, { status: 'available' }) });

  const [f, setF] = useState({
    action: 'checkin', bedId: '', checkInDate: todayISO(), expected: '', rent: '', deposit: '', billingDay: '', discount: '',
    terms: false, invite: false,
  });
  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.value }));
  const setAction = (e) => {
    const action = e.target.value;
    setF((prev) => ({ ...prev, action, checkInDate: action === 'reserve' ? addDaysISO(todayISO(), 7) : todayISO() }));
  };

  if (rooms.isLoading || beds.isLoading) return null;
  const error = rooms.error ?? beds.error;

  const roomById = new Map(rooms.data?.items.map((r) => [r.id, r]));
  const options = (beds.data?.items ?? [])
    .filter((b) => roomById.get(b.room)?.status === 'active')
    .map((b) => ({ value: b.id, label: `Room ${roomById.get(b.room).number} · Bed ${b.label}` }));
  const bedId = f.bedId || (options.some((o) => o.value === initialBedId) ? initialBedId : '') || options[0]?.value || '';
  const bed = beds.data?.items.find((b) => b.id === bedId);
  const defaultRent = bed ? (bed.monthlyRent ?? roomById.get(bed.room)?.defaultMonthlyRent) : undefined;

  const onSubmit = async () => {
    const rent = optionalNumber(f.rent);
    const discount = optionalNumber(f.discount);
    const result = await createStay({
      residentId: resident.id,
      bedId,
      action: f.action,
      checkInDate: f.checkInDate,
      ...(f.expected && { expectedCheckOutDate: f.expected }),
      ...(rent !== undefined && { monthlyRentPaise: toPaise(rent) }),
      depositPaise: toPaise(f.deposit),
      ...(f.billingDay && { billingDay: Number(f.billingDay) }),
      ...(discount !== undefined && { agreedDiscountPaise: toPaise(discount) }),
      termsAcknowledged: f.terms,
      ...(f.invite && { inviteStudent: true }),
    });
    await Promise.all(
      ['residents', 'resident', 'stays'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
    await Promise.all(['beds', 'property'].map((key) => queryClient.invalidateQueries({ queryKey: [key, propertyId] })));
    if (result.invite || result.inviteError) onInvite?.(result);
    onAssigned?.(result, resident);
  };

  return (
    <ModalForm title={`Assign bed · ${resident.fullName}`} onClose={onClose} onSubmit={onSubmit} submitLabel={f.action === 'reserve' ? 'Reserve bed' : 'Check in'}>
      <ErrorBanner error={error} />
      {options.length === 0 ? (
        <p className="text-sm text-slate-600">No available beds in this property. Add beds or free one up first.</p>
      ) : (
        <>
          <SelectField label="Action" options={ACTIONS} value={f.action} onChange={setAction} />
          <SelectField label="Bed" required options={options} value={bedId} onChange={set('bedId')} />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={f.action === 'reserve' ? 'Arrival date' : 'Check-in date'}
              type="date"
              required
              min={f.action === 'reserve' ? addDaysISO(todayISO(), 1) : addDaysISO(todayISO(), -1)}
              max={f.action === 'reserve' ? undefined : todayISO()}
              value={f.checkInDate}
              onChange={set('checkInDate')}
            />
            <Field label="Expected check-out" type="date" min={addDaysISO(f.checkInDate, 1)} value={f.expected} onChange={set('expected')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Monthly rent (₹)"
              type="number"
              min={0}
              step="0.01"
              placeholder={defaultRent === undefined ? 'Required' : `${formatINR(defaultRent)} (bed/room rate)`}
              required={defaultRent === undefined}
              value={f.rent}
              onChange={set('rent')}
            />
            <Field label="Deposit (₹)" type="number" min={0} step="0.01" required value={f.deposit} onChange={set('deposit')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Billing day (1–28)" type="number" min={1} max={28} placeholder="Property default" value={f.billingDay} onChange={set('billingDay')} />
            <Field label="Agreed discount (₹)" type="number" min={0} step="0.01" value={f.discount} onChange={set('discount')} />
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" required className="mt-1" checked={f.terms} onChange={(e) => setF((p) => ({ ...p, terms: e.target.checked }))} />
            The resident has acknowledged the house rules and payment terms.
          </label>
          {resident.email && !resident.userId && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-1" checked={f.invite} onChange={(e) => setF((p) => ({ ...p, invite: e.target.checked }))} />
              Also invite the student to create an account ({resident.email}).
            </label>
          )}
        </>
      )}
    </ModalForm>
  );
}
