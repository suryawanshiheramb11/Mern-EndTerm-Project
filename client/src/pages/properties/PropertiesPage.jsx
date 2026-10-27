import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import PropertyModal from '../../components/properties/PropertyModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_HOME } from '../../lib/roles.js';
import { listProperties } from '../../services/properties.js';

export default function PropertiesPage() {
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['properties'], queryFn: listProperties });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Properties</h1>
        {user.role === 'owner' && (
          <button type="button" onClick={() => setCreating(true)} className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-onaccent hover:bg-accent-hover">
            New property
          </button>
        )}
      </div>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      <ErrorBanner error={error} />

      {data && data.items.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-500">
          {user.role === 'owner' ? 'No properties yet — create your first one.' : 'No properties have been assigned to you.'}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data?.items.map((p) => (
          <Link key={p.id} to={`${ROLE_HOME[user.role]}/properties/${p.id}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold text-slate-800">{p.name}</h2>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs uppercase text-slate-600">{p.type}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {p.address.line1}, {p.address.city}, {p.address.state} {p.address.pincode}
            </p>
            {p.facilities.length > 0 && <p className="mt-2 text-xs text-slate-500">{p.facilities.join(' · ')}</p>}
          </Link>
        ))}
      </div>

      {creating && <PropertyModal onClose={() => setCreating(false)} />}
    </div>
  );
}
