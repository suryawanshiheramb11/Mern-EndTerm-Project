// Strings that a spreadsheet could execute as a formula are neutralised with a leading apostrophe.
// Numbers (including negative paise on reversals) are written as-is.
const FORMULA_START = /^[=+\-@\t\r]/;

export const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const csvRow = (values) => `${values.map(csvCell).join(',')}\r\n`;
