import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ModalForm from '../ModalForm.jsx';
import { Field } from '../AuthForm.jsx';
import SelectField from '../SelectField.jsx';
import { createResident } from '../../services/residents.js';

export default function ResidentModal({ properties, defaultPropertyId, onClose, onCreated }) {
  const queryClient = useQueryClient();
  const [f, setF] = useState({
    propertyId: defaultPropertyId || properties[0]?.id || '',
    fullName: '', phone: '', email: '', emergencyName: '', emergencyPhone: '', notes: '',
  });
  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.value }));

  const onSubmit = async () => {
    const created = await createResident({
      propertyId: f.propertyId,
      fullName: f.fullName,
      phone: f.phone,
      ...(f.email && { email: f.email }),
      ...((f.emergencyName || f.emergencyPhone) && {
        emergencyContact: { ...(f.emergencyName && { name: f.emergencyName }), ...(f.emergencyPhone && { phone: f.emergencyPhone }) },
      }),
      ...(f.notes && { notes: f.notes }),
    });
    await queryClient.invalidateQueries({ queryKey: ['residents'] });
    onCreated?.(created);
  };

  return (
    <ModalForm title="Add resident" onClose={onClose} onSubmit={onSubmit} submitLabel="Add resident">
      <SelectField
        label="Property"
        required
        value={f.propertyId}
        onChange={set('propertyId')}
        options={properties.map((p) => ({ value: p.id, label: p.name }))}
      />
      <Field label="Full name" required value={f.fullName} onChange={set('fullName')} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" required value={f.phone} onChange={set('phone')} />
        <Field label="Email" type="email" value={f.email} onChange={set('email')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Emergency contact" value={f.emergencyName} onChange={set('emergencyName')} />
        <Field label="Emergency phone" value={f.emergencyPhone} onChange={set('emergencyPhone')} />
      </div>
      <Field label="Notes" maxLength={1000} value={f.notes} onChange={set('notes')} />
    </ModalForm>
  );
}
