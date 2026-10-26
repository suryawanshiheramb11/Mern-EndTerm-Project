import { useQuery } from '@tanstack/react-query';
import { listProperties } from '../../services/properties.js';

// Single-property in practice, but the selector is real so multi-property owners work today.
export function useActiveProperty() {
  const properties = useQuery({ queryKey: ['properties'], queryFn: listProperties });
  return { properties, items: properties.data?.items ?? [] };
}

export default function PropertyPicker({ items, value, onChange }) {
  return (
    <select aria-label="Property" value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm">
      {items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}
