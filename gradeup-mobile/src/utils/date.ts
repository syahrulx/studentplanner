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

/** Today as yyyy-mm-dd (local time) */
export function getTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Get Monday–Sunday dates (yyyy-mm-dd) for the week containing the given date */
export function getWeekDatesFor(isoDate: string): { label: string; dateISO: string; dayNum: number }[] {
  const d = new Date(isoDate + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return labels.map((label, i) => {
    const x = new Date(d);
    x.setDate(x.getDate() + i);
    const dateISO = x.toISOString().slice(0, 10);
    return { label, dateISO, dayNum: x.getDate() };
  });
}

/** Get Sunday–Saturday dates (yyyy-mm-dd) for the week containing the given date. Day labels: Sun, Mon, ... */
export function getWeekDatesSundayFirst(isoDate: string): { label: string; dateISO: string; dayNum: string }[] {
  const d = new Date(isoDate + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return labels.map((label, i) => {
    const x = new Date(d);
    x.setDate(x.getDate() + i);
    const dateISO = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    return { label, dateISO, dayNum: String(x.getDate()) };
  });
}

/** Whether dateISO falls within the week (Sun–Sat) that contains refISO */
export function isDateInWeek(dateISO: string, refISO: string): boolean {
  const ref = new Date(refISO + 'T12:00:00');
  const day = ref.getDay();
  ref.setDate(ref.getDate() - day);
  const y = ref.getFullYear(), m = ref.getMonth(), d = ref.getDate();
  const sun = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const satDate = new Date(y, m, d + 6);
  const sat = `${satDate.getFullYear()}-${String(satDate.getMonth() + 1).padStart(2, '0')}-${String(satDate.getDate()).padStart(2, '0')}`;
  return dateISO >= sun && dateISO <= sat;
}

/** Short month name + year from yyyy-mm-dd */
export function getMonthYearLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00');
  const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** ISO week number (1–53) for given date */
export function getWeekNumber(isoDate: string): number {
  const d = new Date(isoDate + 'T12:00:00');
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/** Calendar grid for a month: array of null (empty) or day number 1–31 */
export function getMonthGrid(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();
  const out: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) out.push(null);
  for (let d = 1; d <= daysInMonth; d++) out.push(d);
  return out;
}

/** yyyy-mm-dd for a given year, month, day (day 1–31) — local time */
export function toISO(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
