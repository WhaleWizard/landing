/** Keep spreadsheet-like text literal when a CSV is opened in a spreadsheet. */
export function defuseFormula(value: string): string {
  const first = value.trimStart()[0] || '';
  if (first === '-' && /^-?[\d\s.,]+%?$/.test(value)) return value;
  return (first && '=+-@'.includes(first)) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
}

export function escapeAdminCsvCell(value: unknown): string {
  const safe = defuseFormula(String(value ?? ''));
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
