import { useQuery } from '@tanstack/react-query';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import { getProfile } from '../../services/me.js';

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{children ?? '—'}</dd>
    </div>
  );
}

export default function StudentProfile() {
  const { data, error, isLoading } = useQuery({ queryKey: ['me', 'profile'], queryFn: getProfile });
  if (isLoading) return <p className="text-slate-500">Loading…</p>;
  if (error) return <ErrorBanner error={error} />;
  const { user, resident, property } = data;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Profile</h1>
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold text-slate-800">Account</h2>
        <dl>
          <Row label="Name">{user.name}</Row>
          <Row label="Email">{user.email}</Row>
          <Row label="Email verified">{user.emailVerified ? 'Yes' : 'No'}</Row>
        </dl>
      </section>
      {resident && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold text-slate-800">Resident details</h2>
          <dl>
            <Row label="Phone">{resident.phone}</Row>
            <Row label="Emergency contact">{resident.emergencyContact?.name ? `${resident.emergencyContact.name} · ${resident.emergencyContact.phone ?? ''}` : null}</Row>
            <Row label="ID verification">{resident.idVerification?.status?.replace('_', ' ')}</Row>
            <Row label="Property">{property?.name}</Row>
            <Row label="Property contact">{property?.contact?.phone}</Row>
          </dl>
          <p className="mt-3 text-xs text-slate-500">To change these details, ask your warden.</p>
        </section>
      )}
    </div>
  );
}
