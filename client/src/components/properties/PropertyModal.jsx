import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ModalForm from '../ModalForm.jsx';
import { Field } from '../AuthForm.jsx';
import SelectField from '../SelectField.jsx';
import { splitList } from '../../lib/format.js';
import { createProperty } from '../../services/properties.js';

const TYPES = [
  { value: 'pg', label: 'PG' },
  { value: 'hostel', label: 'Hostel' },
  { value: 'apartment', label: 'Apartment' },
];

export default function PropertyModal({ onClose }) {
  const queryClient = useQueryClient();
  const [f, setF] = useState({
    name: '', type: 'pg', line1: '', city: '', state: '', pincode: '', contactName: '', contactPhone: '', facilities: '',
  });
  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.value }));

  const onSubmit = async () => {
    await createProperty({
      name: f.name,
      type: f.type,
      address: { line1: f.line1, city: f.city, state: f.state, pincode: f.pincode },
      ...(f.contactName && f.contactPhone && { contact: { name: f.contactName, phone: f.contactPhone } }),
      facilities: splitList(f.facilities),
    });
    await queryClient.invalidateQueries({ queryKey: ['properties'] });
  };

  return (
    <ModalForm title="New property" onClose={onClose} onSubmit={onSubmit} submitLabel="Create property">
      <Field label="Name" required value={f.name} onChange={set('name')} />
      <SelectField label="Type" options={TYPES} value={f.type} onChange={set('type')} />
      <Field label="Address" required value={f.line1} onChange={set('line1')} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="City" required value={f.city} onChange={set('city')} />
        <Field label="State" required value={f.state} onChange={set('state')} />
      </div>
      <Field label="Pincode" required value={f.pincode} onChange={set('pincode')} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact name" value={f.contactName} onChange={set('contactName')} />
        <Field label="Contact phone" value={f.contactPhone} onChange={set('contactPhone')} />
      </div>
      <Field label="Facilities (comma separated)" placeholder="wifi, mess, laundry" value={f.facilities} onChange={set('facilities')} />
    </ModalForm>
  );
}
