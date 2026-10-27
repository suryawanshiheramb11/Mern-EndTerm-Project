import { useState } from 'react';
import ModalForm from '../ModalForm.jsx';
import { Field } from '../AuthForm.jsx';
import SelectField from '../SelectField.jsx';

const BLOOD = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((v) => ({ value: v, label: v || 'Not set' }));
const GENDER = [{ value: '', label: 'Not set' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other', label: 'Other' }];

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj?.[k] ?? '']));
const G = ['name', 'relation', 'phone', 'email', 'address'];
const M = ['bloodGroup', 'conditions', 'allergies', 'medications', 'doctorName', 'doctorPhone', 'insurance'];

// Only filled-in fields are sent; blank means "leave as it is".
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined));

function Area({ label, ...props }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <textarea rows={2} {...props} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" />
    </label>
  );
}

// Used by staff (on a resident) and by students (on their own profile; `self` adds emergency contact, hides nothing else).
export default function DetailsModal({ resident, onSave, onClose, self = false }) {
  const [p, setP] = useState({
    dateOfBirth: resident.dateOfBirth ? String(resident.dateOfBirth).slice(0, 10) : '',
    gender: resident.gender ?? '', institution: resident.institution ?? '', permanentAddress: resident.permanentAddress ?? '',
  });
  const [g, setG] = useState(pick(resident.guardian, G));
  const [m, setM] = useState(pick(resident.medical, M));
  const [ec, setEc] = useState(pick(resident.emergencyContact, ['name', 'phone']));
  const upd = (setter) => (key) => (e) => setter((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async () => {
    const patch = {
      ...compact(p),
      ...(Object.keys(compact(g)).length && { guardian: compact(g) }),
      ...(Object.keys(compact(m)).length && { medical: compact(m) }),
      ...(self && Object.keys(compact(ec)).length && { emergencyContact: compact(ec) }),
    };
    await onSave(patch);
  };

  return (
    <ModalForm title="Personal, guardian and health details" onClose={onClose} onSubmit={submit} submitLabel="Save details">
      <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">Personal</legend>
          <Field label="Date of birth" type="date" value={p.dateOfBirth} onChange={upd(setP)('dateOfBirth')} max={new Date().toISOString().slice(0, 10)} />
          <SelectField label="Gender" options={GENDER} value={p.gender} onChange={upd(setP)('gender')} />
          <Field label="College or workplace" maxLength={150} value={p.institution} onChange={upd(setP)('institution')} />
          <Area label="Permanent address" maxLength={300} value={p.permanentAddress} onChange={upd(setP)('permanentAddress')} />
        </fieldset>
        {self && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-900">Emergency contact</legend>
            <Field label="Name" maxLength={100} value={ec.name} onChange={upd(setEc)('name')} />
            <Field label="Phone" type="tel" value={ec.phone} onChange={upd(setEc)('phone')} />
          </fieldset>
        )}
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">Parent or guardian</legend>
          <Field label="Name" maxLength={100} value={g.name} onChange={upd(setG)('name')} />
          <Field label="Relation (e.g. Father, Mother)" maxLength={40} value={g.relation} onChange={upd(setG)('relation')} />
          <Field label="Phone" type="tel" value={g.phone} onChange={upd(setG)('phone')} />
          <Field label="Email" type="email" value={g.email} onChange={upd(setG)('email')} />
          <Area label="Address" maxLength={300} value={g.address} onChange={upd(setG)('address')} />
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">Health</legend>
          <SelectField label="Blood group" options={BLOOD} value={m.bloodGroup} onChange={upd(setM)('bloodGroup')} />
          <Area label="Medical conditions" maxLength={500} value={m.conditions} onChange={upd(setM)('conditions')} />
          <Area label="Allergies" maxLength={500} value={m.allergies} onChange={upd(setM)('allergies')} />
          <Area label="Regular medication" maxLength={500} value={m.medications} onChange={upd(setM)('medications')} />
          <Field label="Doctor's name" maxLength={100} value={m.doctorName} onChange={upd(setM)('doctorName')} />
          <Field label="Doctor's phone" type="tel" value={m.doctorPhone} onChange={upd(setM)('doctorPhone')} />
          <Field label="Health insurance" maxLength={200} value={m.insurance} onChange={upd(setM)('insurance')} />
        </fieldset>
        <p className="text-xs text-slate-500">Health details are visible to the owner and wardens only, never to maintenance staff.</p>
      </div>
    </ModalForm>
  );
}
