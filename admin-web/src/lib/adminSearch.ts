/**
 * Global admin top-bar search: every whitespace-separated term must appear
 * somewhere in the concatenated fields (case-insensitive).
 */
export function matchesAdminSearch(
  raw: string,
  ...fields: Array<string | number | boolean | null | undefined>
): boolean {
  const terms = raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return true;
  const blob = fields.map((f) => String(f ?? '')).join(' ').toLowerCase();
  return terms.every((t) => blob.includes(t));
}
