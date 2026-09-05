export function normaliseRecordName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s\-_.,()]+/g, ' ')
    .trim();
}

/** Returns IDs belonging to a key shared by at least two records. */
export function duplicateRecordIds<T extends { id: string }>(
  rows: T[],
  keyFor: (row: T) => string,
): Set<string> {
  const byKey = new Map<string, string[]>();
  for (const row of rows) {
    const key = keyFor(row);
    if (!key) continue;
    const ids = byKey.get(key) ?? [];
    ids.push(row.id);
    byKey.set(key, ids);
  }
  const duplicates = new Set<string>();
  byKey.forEach((ids) => {
    if (ids.length > 1) ids.forEach((id) => duplicates.add(id));
  });
  return duplicates;
}
