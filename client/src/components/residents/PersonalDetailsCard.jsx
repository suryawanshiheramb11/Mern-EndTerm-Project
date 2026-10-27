import { formatDate } from '../../lib/format.js';

function Row({ label, children }) {
  if (!children) return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{children}</dd>
    </div>
  );
}

const empty = (o) => !o || Object.values(o).every((v) => !v);

// Read-only view of the personal, guardian and health block; the edit button is passed in by the page.
export default function PersonalDetailsCard({ resident: r, action, title = 'Personal, guardian and health' }) {
  const g = r.guardian;
  const m = r.medical;
  const nothing = !r.dateOfBirth && !r.gender && !r.institution && !r.permanentAddress && empty(g) && empty(m);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-800">{title}</h2>
        {action}
      </div>
      {nothing ? (
        <p className="text-sm text-slate-500">Nothing added yet.</p>
      ) : (
        <div className="space-y-3">
          <dl>
            <Row label="Date of birth">{r.dateOfBirth && formatDate(r.dateOfBirth)}</Row>
            <Row label="Gender"><span className="capitalize">{r.gender}</span></Row>
            <Row label="College or workplace">{r.institution}</Row>
            <Row label="Permanent address">{r.permanentAddress}</Row>
          </dl>
          {!empty(g) && (
            <div className="border-t border-slate-100 pt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Parent or guardian</p>
              <dl>
                <Row label="Name">{g.name && `${g.name}${g.relation ? ` (${g.relation})` : ''}`}</Row>
                <Row label="Phone">{g.phone}</Row>
                <Row label="Email">{g.email}</Row>
                <Row label="Address">{g.address}</Row>
              </dl>
            </div>
          )}
          {!empty(m) && (
            <div className="border-t border-slate-100 pt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Health</p>
              <dl>
                <Row label="Blood group">{m.bloodGroup}</Row>
                <Row label="Conditions">{m.conditions}</Row>
                <Row label="Allergies">{m.allergies}</Row>
                <Row label="Medication">{m.medications}</Row>
                <Row label="Doctor">{m.doctorName && `${m.doctorName}${m.doctorPhone ? ` · ${m.doctorPhone}` : ''}`}</Row>
                <Row label="Insurance">{m.insurance}</Row>
              </dl>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
