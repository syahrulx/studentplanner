// Ensure .env is applied when evaluating config (Expo does not always inject into app.config).
try {
  require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
} catch (_) {
  /* optional dep path */
}

function cleanEnvString(v) {
  if (v == null || typeof v !== 'string') return '';
  let s = v.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  if (/^Bearer\s+/i.test(s)) s = s.replace(/^Bearer\s+/i, '').trim();
  return s;
}

export default ({ config }) => ({
  ...config,
  extra: {
    ...config?.extra,
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY || '',
    supabaseUrl: cleanEnvString(
      process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://ujxrtuogdialsrzxkcey.supabase.co'
    ),
    /** Must be the JWT anon key from Supabase → Settings → API (starts with eyJ). Not sb_publishable_* — Edge Functions reject those. */
    supabaseAnonKey: cleanEnvString(process.env.EXPO_PUBLIC_SUPABASE_KEY || ''),
    openaiApiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY || '',
    /** Must match Storage bucket id in the same Supabase project as supabaseUrl */
    sowFilesBucket: process.env.EXPO_PUBLIC_SOW_BUCKET || 'sow-files',
  },
});
