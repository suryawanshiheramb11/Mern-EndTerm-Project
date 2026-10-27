// Small outline icon set on a 24px grid. Stroke weight matches adjacent 15px text; decorative unless given a label.
const PATHS = {
  dashboard: 'M4 4h7v7H4z M13 4h7v4h-7z M13 11h7v9h-7z M4 14h7v6H4z',
  building: 'M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17 M15 9h3a1 1 0 0 1 1 1v11 M3 21h18 M9 7h2 M9 11h2 M9 15h2',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20 M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7 M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35 M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  rent: 'M3 7h18v10H3z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4 M6.5 10v.01 M17.5 14v.01',
  refund: 'M9 14 4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  chart: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',
  message: 'M4 5h16v11H9l-5 4z',
  home: 'M3 11 12 4l9 7 M5 10v10h14V10 M10 20v-6h4v6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21a8 8 0 0 1 16 0',
  bell: 'M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z M10 21h4',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  close: 'M6 6l12 12 M18 6 6 18',
  logout: 'M10 4H5v16h5 M15 8l4 4-4 4 M19 12H9',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M8 12.5l2.7 2.7L16 9.8',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 11v5 M12 8v.01',
};

export default function Icon({ name, size = 20, label, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
