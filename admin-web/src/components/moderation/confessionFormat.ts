/** '' is a real campus key — the rows a single-campus university posts under. */
export const campusKey = (campus: string | null) => campus ?? '';
export const campusLabel = (campus: string | null) => (campus ?? '').trim() || 'No campus';

/** Short "how long ago" label, falling back to a date after a month. */
export function when(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  if (mins < 60 * 24 * 30) return `${Math.round(mins / (60 * 24))}d ago`;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
