// Load .env manually (dotenv is not installed as a dependency).
// This ensures EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN is available during EAS builds
// where Expo CLI does not auto-load .env for native config evaluation.
const fs = require('fs');
const path = require('path');
try {
  const envPath = path.resolve(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      // Don't override existing env vars (eas.json takes priority)
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
} catch (_) {
  /* ignore read errors */
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

export default ({ config }) => {
  const base = config ?? {};
  const ios = base.ios ?? {};
  const infoPlist = ios.infoPlist ?? {};
  const existingModes = infoPlist.UIBackgroundModes;
  const modes = Array.isArray(existingModes) ? [...existingModes] : [];
  for (const m of ['fetch', 'remote-notification']) {
    if (!modes.includes(m)) modes.push(m);
  }

  return {
    ...base,
    ios: {
      ...ios,
      infoPlist: {
        ...infoPlist,
        UIBackgroundModes: modes,
        // Mapbox iOS SDK reads this at native startup — eliminates race condition
        // where MapView renders before the JS setAccessToken() bridge call completes.
        MBXAccessToken: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || '',
      },
    },
  /** Required for dev-client deep links / Metro “open in app”; must match native build after prebuild. */
  scheme: base?.scheme ?? 'rencana',
  plugins: [
    ...(base?.plugins ?? []),
    '@react-native-community/datetimepicker',
    [
      '@rnmapbox/maps',
      {
        // Use the public access token as fallback — no secret (sk.) token configured.
        // EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN is set in eas.json for all build profiles.
        RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOAD_TOKEN || process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || '',
      },
    ],
  ],
  extra: {
    ...base?.extra,
    eas: {
      projectId: '29240ff0-6a41-4552-bd3e-9b6b6ddf6b38',
    },
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY || '',
    supabaseUrl: cleanEnvString(
      process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://ujxrtuogdialsrzxkcey.supabase.co'
    ),
    /** Supabase client key (publishable or anon JWT) for mobile client auth and function gateway access. */
    supabaseAnonKey: cleanEnvString(process.env.EXPO_PUBLIC_SUPABASE_KEY || ''),
    // openaiApiKey removed — AI calls now go through Edge Functions (ai_generate, ai_pdf_extract).
    // Set OPENAI_API_KEY as a Supabase Edge Function secret instead:
    //   npx supabase secrets set OPENAI_API_KEY=sk-...
    spotifyClientId: process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID || '',
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
    /** Must match Storage bucket id in the same Supabase project as supabaseUrl */
    sowFilesBucket: process.env.EXPO_PUBLIC_SOW_BUCKET || 'sow-files',
    /** UiTM MyStudent Firebase API key (Identity Toolkit Web API). */
    firebaseWebApiKey: process.env.EXPO_PUBLIC_FIREBASE_WEB_API_KEY || '',
  },
  };
};
