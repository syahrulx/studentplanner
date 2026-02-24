/**
 * Display format: dd-mm-yyyy everywhere the user sees a date.
 * Internal storage remains yyyy-mm-dd for sorting and ISO compatibility.
 */

/** Convert internal yyyy-mm-dd to display dd-mm-yyyy */
export function formatDisplayDate(isoDate: string): string {
  if (!isoDate || isoDate.length < 10) return isoDate;
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  return `${d}-${m}-${y}`;
}

/**
 * Parse user input to internal yyyy-mm-dd.
 * Accepts dd-mm-yyyy or yyyy-mm-dd.
 */
export function parseDisplayDate(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const parts = s.split(/[-/]/);
  if (parts.length !== 3) return null;
  // Already yyyy-mm-dd (first part 4 digits)
  if (parts[0].length === 4 && parts[1].length <= 2 && parts[2].length <= 2) {
    const [y, m, d] = parts.map((p) => p.padStart(2, '0'));
    if (m.length <= 2 && d.length <= 2) return `${y}-${m}-${d}`;
  }
  // dd-mm-yyyy
  if (parts[2].length === 4 && parts[0].length <= 2 && parts[1].length <= 2) {
    const [d, m, y] = parts.map((p) => p.padStart(2, '0'));
    return `${y}-${m}-${d}`;
  }
  return null;
}
