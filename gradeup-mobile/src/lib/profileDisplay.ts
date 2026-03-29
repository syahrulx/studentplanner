/** Placeholder when profile field is not set (e.g. before university connect). */
export const PROFILE_PLACEHOLDER = '—';

export function displayProfileText(value: string | undefined | null): string {
  const t = (value ?? '').trim();
  return t.length > 0 ? t : PROFILE_PLACEHOLDER;
}

export function displayPortalSemester(sem: number | undefined | null): string {
  if (sem != null && Number.isFinite(sem) && sem > 0) return String(Math.floor(sem));
  return PROFILE_PLACEHOLDER;
}
