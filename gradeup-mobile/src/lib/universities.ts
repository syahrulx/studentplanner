/**
 * Malaysian universities list.
 * Fetches from Hipo API (https://universities.hipolabs.com/search?country=Malaysia).
 * Falls back to a static list if the API fails.
 */

export interface UniversityItem {
  name: string;
  country?: string;
  alpha_two_code?: string;
  domains?: string[];
  web_pages?: string[];
}

const HIPO_API = 'https://universities.hipolabs.com/search?country=Malaysia';

/** Fallback list of major Malaysian universities if API is unavailable */
const FALLBACK_UNIVERSITIES: UniversityItem[] = [
  { name: 'Universiti Malaya (UM)' },
  { name: 'Universiti Kebangsaan Malaysia (UKM)' },
  { name: 'Universiti Putra Malaysia (UPM)' },
  { name: 'Universiti Sains Malaysia (USM)' },
  { name: 'Universiti Teknologi Malaysia (UTM)' },
  { name: 'Universiti Islam Antarabangsa Malaysia (UIAM)' },
  { name: 'Universiti Utara Malaysia (UUM)' },
  { name: 'Universiti Malaysia Sarawak (UNIMAS)' },
  { name: 'Universiti Malaysia Sabah (UMS)' },
  { name: 'Universiti Pendidikan Sultan Idris (UPSI)' },
  { name: 'Universiti Teknologi MARA (UiTM)' },
  { name: 'Universiti Malaysia Pahang (UMP)' },
  { name: 'Universiti Malaysia Perlis (UniMAP)' },
  { name: 'Universiti Malaysia Terengganu (UMT)' },
  { name: 'Universiti Tun Hussein Onn Malaysia (UTHM)' },
  { name: 'Universiti Teknikal Malaysia Melaka (UTeM)' },
  { name: 'Universiti Malaysia Kelantan (UMK)' },
  { name: 'Multimedia University (MMU)' },
  { name: 'Taylor\'s University' },
  { name: 'Sunway University' },
  { name: 'Monash University Malaysia' },
  { name: 'University of Nottingham Malaysia' },
  { name: 'International Islamic University Malaysia (IIUM)' },
  { name: 'Management and Science University (MSU)' },
  { name: 'Universiti Tenaga Nasional (UNITEN)' },
  { name: 'Universiti Teknologi Petronas (UTP)' },
  { name: 'Limkokwing University of Creative Technology' },
  { name: 'SEGI University' },
  { name: 'Asia Pacific University (APU)' },
  { name: 'UCSI University' },
];

let cached: UniversityItem[] | null = null;

/**
 * Fetches list of universities in Malaysia from Hipo API.
 * Returns cached result or fallback list on error.
 */
export async function getMalaysianUniversities(): Promise<UniversityItem[]> {
  if (cached) return cached;
  try {
    const res = await fetch(HIPO_API, { method: 'GET' });
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      cached = data.map((u: { name?: string; country?: string; alpha_two_code?: string; domains?: string[]; web_pages?: string[] }) => ({
        name: u.name ?? '',
        country: u.country,
        alpha_two_code: u.alpha_two_code,
        domains: u.domains,
        web_pages: u.web_pages,
      }));
      return cached!;
    }
  } catch (_) {
    // use fallback
  }
  cached = FALLBACK_UNIVERSITIES;
  return cached;
}
