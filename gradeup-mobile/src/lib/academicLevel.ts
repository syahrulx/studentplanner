import type { AcademicLevel } from '../types';

/**
 * `profiles.academic_level` holds two vocabularies. Onboarding wrote its own lowercase chip keys
 * (`foundation`, `degree`, `masters`, `phd`) while everything that reads the column expects the
 * `AcademicLevel` union (`Foundation`, `Bachelor`, `Master`, `PhD`). Rows written by onboarding
 * therefore failed the read-side whitelist and became `undefined`, which silently defeated every
 * `academicLevel === 'Foundation'` check — UiTM foundation students were handed the Group B
 * calendar because the comparison could never be true.
 *
 * Normalising on both read and write lets the legacy rows work without waiting for a data
 * migration, and stops new rows from joining them.
 */

const CANONICAL: readonly AcademicLevel[] = [
  'Foundation',
  'Diploma',
  'Bachelor',
  'Master',
  'PhD',
  'Other',
];

const ALIASES: Record<string, AcademicLevel> = {
  foundation: 'Foundation',
  asasi: 'Foundation',
  matrikulasi: 'Foundation',
  matriculation: 'Foundation',
  'pre-u': 'Foundation',
  preu: 'Foundation',
  stpm: 'Foundation',
  diploma: 'Diploma',
  sijil: 'Diploma',
  degree: 'Bachelor',
  bachelor: 'Bachelor',
  bachelors: 'Bachelor',
  undergraduate: 'Bachelor',
  ijazah: 'Bachelor',
  'sarjana muda': 'Bachelor',
  master: 'Master',
  masters: 'Master',
  sarjana: 'Master',
  phd: 'PhD',
  doctorate: 'PhD',
  'doktor falsafah': 'PhD',
  other: 'Other',
  lain: 'Other',
};

/**
 * Canonical `AcademicLevel` for a stored or user-supplied value, or `undefined` when the value is
 * empty or unrecognised. Matching is case- and whitespace-insensitive.
 */
export function normalizeAcademicLevel(value: unknown): AcademicLevel | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;

  const exact = CANONICAL.find((level) => level === raw);
  if (exact) return exact;

  return ALIASES[raw.toLowerCase().replace(/\s+/g, ' ')];
}
