export default function SelectField({ label, options, ...props }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <select
        {...props}
        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
