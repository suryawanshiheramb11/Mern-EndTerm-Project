const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

export const formatINR = (rupees) => inr.format(rupees);

// Form helpers: '' -> undefined, otherwise a number.
export const optionalNumber = (value) => (value === '' || value === undefined ? undefined : Number(value));
export const splitList = (value) => value.split(',').map((s) => s.trim()).filter(Boolean);

// Stays and residents use integer paise on the wire; inventory (rooms, beds) uses rupees.
export const toPaise = (rupees) => Math.round(Number(rupees) * 100);
export const formatPaise = (paise) => formatINR(paise / 100);

const IST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });

// Dates are YYYY-MM-DD in the business timezone (mirrors server/src/utils/dates.js).
export const todayISO = () => IST.format(new Date());
export const addDaysISO = (iso, days) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// Parses a typed rupee amount ("5000", "5000.5", "5,000.50") into integer paise without going
// through floating point. Returns null for anything that isn't a plain amount with <= 2 decimals.
export const parseRupeesToPaise = (text) => {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(text).replace(/,/g, '').trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number(((m[2] ?? '') + '00').slice(0, 2));
};

export const paiseToInput = (paise) => `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;

export const formatPeriod = (periodKey) => {
  const [y, m] = periodKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'short', year: 'numeric' });
};
