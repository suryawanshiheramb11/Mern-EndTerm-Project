// Presentation only: scales the server-provided series into an SVG polyline.
export default function Sparkline({ values, label, width = 96, height = 28 }) {
  if (!values?.length || values.every((v) => v === 0)) return <span className="text-xs text-slate-300" aria-label={`${label}: no data`}>no trend yet</span>;
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * (height - 4) - 2).toFixed(1)}`).join(' ');
  return (
    <svg role="img" aria-label={label} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="text-slate-500">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={points} />
    </svg>
  );
}
