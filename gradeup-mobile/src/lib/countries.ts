/**
 * Countries Rencana currently supports. ISO 3166-1 alpha-2 codes, matching
 * `profiles.country` / `universities.country` — see migration
 * 20260807000001_add_country_field.sql. Malaysia is always first (the
 * default for every existing user).
 *
 * Add a new country here + seed its universities in the `universities`
 * table (admin-web -> Universities, or a migration like
 * 20260807000002_seed_overseas_universities.sql) to support it — no other
 * code changes needed for the picker or the dialing-code lookup.
 */
export interface CountryOption {
  code: string;
  name: string;
  flag: string;
  /** Calling code, no leading '+'. */
  dialingCode: string;
}

export const COUNTRIES: CountryOption[] = [
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', dialingCode: '60' },
  { code: 'US', name: 'United States', flag: '🇺🇸', dialingCode: '1' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', dialingCode: '44' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', dialingCode: '1' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', dialingCode: '61' },
];

export const DEFAULT_COUNTRY_CODE = 'MY';

export function getCountryByCode(code: string | undefined | null): CountryOption {
  const cc = (code || '').trim().toUpperCase();
  return COUNTRIES.find((c) => c.code === cc) ?? COUNTRIES[0];
}

/** Calling code (no '+') for a country. Falls back to Malaysia's if unknown — matches prior hardcoded behavior for anyone without a country set yet. */
export function dialingCodeForCountry(code: string | undefined | null): string {
  return getCountryByCode(code).dialingCode;
}
