import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import BedsTab from '../../components/properties/BedsTab.jsx';
import RoomsTab from '../../components/properties/RoomsTab.jsx';
import StaffTab from '../../components/staff/StaffTab.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatINR } from '../../lib/format.js';
import { propertiesPath } from '../../lib/roles.js';
import { getOverview, getProperty } from '../../services/properties.js';

const TABS = [
  { id: 'rooms', label: 'Rooms' },
  { id: 'beds', label: 'Beds' },
];

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-800">{value}</div>
    </div>
  );
}

export default function PropertyDetailPage() {
  const { propertyId } = useParams();
  const { user } = useAuth();
  const [tab, setTab] = useState('rooms');

  const property = useQuery({ queryKey: ['property', propertyId], queryFn: () => getProperty(propertyId) });
  const overview = useQuery({ queryKey: ['property', propertyId, 'overview'], queryFn: () => getOverview(propertyId) });

  if (property.isLoading) return <p className="text-slate-500">Loading…</p>;
  if (property.error) return <ErrorBanner error={property.error} />;

  const p = property.data;
  const o = overview.data;
  const range = o?.monthlyRentRange;

  return (
    <div className="space-y-6">
      <div>
        <Link to={propertiesPath(user.role)} className="text-sm text-slate-500 hover:underline">
          ← Properties
        </Link>
        <h1 className="text-xl font-bold text-slate-800">{p.name}</h1>
        <p className="text-sm text-slate-500">
          {p.address.line1}, {p.address.city}, {p.address.state} {p.address.pincode}
        </p>
      </div>

      {o && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Rooms" value={o.totalRooms} />
          <Stat label="Beds" value={o.totalBeds} />
          <Stat label="Available" value={o.bedsByStatus.available} />
          <Stat label="Rent range" value={range ? `${formatINR(range.min)} – ${formatINR(range.max)}` : '—'} />
        </div>
      )}

      <div className="border-b border-slate-200">
        {[...TABS, ...(user.role === 'owner' ? [{ id: 'staff', label: 'Staff' }] : [])].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t.id ? 'border-slate-800 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'rooms' && <RoomsTab propertyId={propertyId} />}
      {tab === 'beds' && <BedsTab propertyId={propertyId} />}
      {tab === 'staff' && user.role === 'owner' && <StaffTab propertyId={propertyId} />}
    </div>
  );
}
