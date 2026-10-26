import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ModalForm from '../ModalForm.jsx';
import { Field } from '../AuthForm.jsx';
import SelectField from '../SelectField.jsx';
import { createComplaint } from '../../services/complaints.js';

const CATEGORIES = ['plumbing', 'electrical', 'internet', 'cleaning', 'furniture', 'food', 'security', 'other'].map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }));
const URGENCIES = [
  { value: 'low', label: 'Low (about a week)' },
  { value: 'medium', label: 'Medium (about 3 days)' },
  { value: 'high', label: 'High (within a day)' },
];

export default function RaiseComplaintModal({ onClose }) {
  const queryClient = useQueryClient();
  const [f, setF] = useState({ category: 'plumbing', urgency: 'medium', title: '', description: '', photo: '' });
  const set = (key) => (e) => setF((prev) => ({ ...prev, [key]: e.target.value }));

  const onSubmit = async () => {
    // Photos are links to files hosted elsewhere for now; real uploads replace this field later.
    await createComplaint({
      category: f.category,
      urgency: f.urgency,
      title: f.title,
      description: f.description,
      ...(f.photo.trim() && { attachments: [{ url: f.photo.trim() }] }),
    });
    await queryClient.invalidateQueries({ queryKey: ['complaints'] });
  };

  return (
    <ModalForm title="Raise a complaint" onClose={onClose} onSubmit={onSubmit} submitLabel="Submit">
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Category" options={CATEGORIES} value={f.category} onChange={set('category')} />
        <SelectField label="Urgency" options={URGENCIES} value={f.urgency} onChange={set('urgency')} />
      </div>
      <Field label="Title" required minLength={3} maxLength={120} value={f.title} onChange={set('title')} />
      <label className="block text-sm font-medium text-slate-700">
        Description
        <textarea required minLength={3} maxLength={2000} rows={4} value={f.description} onChange={set('description')} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900" />
      </label>
      <Field label="Photo link (optional, https)" type="url" value={f.photo} onChange={set('photo')} />
    </ModalForm>
  );
}
