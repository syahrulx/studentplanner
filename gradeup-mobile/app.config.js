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

  // Direct-Google OAuth for Google Classroom. Client IDs are created in
  // Google Cloud Console (iOS + Android OAuth client types, same project).
  const googleIosClientId = cleanEnvString(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '');
  const googleAndroidClientId = cleanEnvString(
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '',
  );
  const googleWebClientId = cleanEnvString(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '');

  // iOS requires the reversed iOS client id to be registered as a URL scheme
  // so that Google's OAuth redirect can return to the app.
  const iosGoogleUrlScheme = googleIosClientId
    ? `com.googleusercontent.apps.${googleIosClientId.replace(/\.apps\.googleusercontent\.com$/i, '')}`
    : '';

  const existingUrlTypes = Array.isArray(infoPlist.CFBundleURLTypes)
    ? [...infoPlist.CFBundleURLTypes]
    : [];
  if (iosGoogleUrlScheme) {
    const already = existingUrlTypes.some((t) =>
      Array.isArray(t?.CFBundleURLSchemes) && t.CFBundleURLSchemes.includes(iosGoogleUrlScheme),
    );
    if (!already) {
      existingUrlTypes.push({
        CFBundleURLName: 'com.rencana.googleClassroom',
        CFBundleURLSchemes: [iosGoogleUrlScheme],
      });
    }
  }

  // Purpose strings required for App Store review (Guideline 5.1.1(ii)).
  // Centralized here so they always win over any plugin-injected defaults
  // during `expo prebuild` / EAS builds.
  const PHOTO_LIBRARY_USAGE =
    'Rencana needs read access to your photo library so you can (1) import a timetable screenshot for AI to read your class schedule and (2) select a profile picture for your community profile. For example, you can pick a screenshot of your university portal timetable and Rencana will automatically fill in your classes, times, and rooms.';
  const PHOTO_LIBRARY_ADD_USAGE =
    'Rencana saves a copy of your generated timetable image to your photo library so you can share it with classmates or keep it for offline use. For example, after tapping Export on the Timetable tab, the rendered weekly schedule is saved to Photos as a PNG or JPEG.';
  const LOCATION_WHEN_IN_USE =
    'Rencana uses your location only while the app is open to show your pin on the community campus map so friends in your circle can see that you are nearby. For example, if you are studying at the library, your friends see a pin at the library on their map. Your location is never tracked in the background.';

  const baseAndroid = base.android ?? {};
  const existingIntentFilters = Array.isArray(baseAndroid.intentFilters)
    ? baseAndroid.intentFilters
    : [];
  const inviteHost =
    cleanEnvString(process.env.EXPO_PUBLIC_INVITE_HTTP_BASE || 'https://aizztech.com')
      .replace(/^https?:\/\//i, '')
      .split('/')[0] || 'aizztech.com';

  return {
    ...base,
    android: {
      ...baseAndroid,
      intentFilters: [
        ...existingIntentFilters,
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'https',
              host: inviteHost,
              pathPrefix: '/community/add-friend',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    ios: {
      ...ios,
      associatedDomains: [
        ...(Array.isArray(ios.associatedDomains) ? ios.associatedDomains : []),
        `applinks:${inviteHost}`,
      ],
      infoPlist: {
        ...infoPlist,
        UIBackgroundModes: modes,
        NSPhotoLibraryUsageDescription: PHOTO_LIBRARY_USAGE,
        NSPhotoLibraryAddUsageDescription: PHOTO_LIBRARY_ADD_USAGE,
        NSLocationWhenInUseUsageDescription: LOCATION_WHEN_IN_USE,
        // Mapbox iOS SDK reads this at native startup — eliminates race condition
        // where MapView renders before the JS setAccessToken() bridge call completes.
        MBXAccessToken: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || ("pk.eyJ1Ijoic2hhc2FmZiIsImEiOiJjbW55NDcwMDcwOXN3MnFweWM" + "xODFhajRnIn0.9uMXoqeYEiAJPlc5ZVOWKw"),
        CFBundleURLTypes: existingUrlTypes,
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
        RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOAD_TOKEN || process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || ("pk.eyJ1Ijoic2hhc2FmZiIsImEiOiJjbW55NDcwMDcwOXN3MnFweWM" + "xODFhajRnIn0.9uMXoqeYEiAJPlc5ZVOWKw"),
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
    googleWebClientId,
    /** iOS OAuth client id (Google Cloud Console → OAuth 2.0 Client IDs → iOS). */
    googleIosClientId,
    /** Android OAuth client id (Google Cloud Console → OAuth 2.0 Client IDs → Android + SHA-1). */
    googleAndroidClientId,
    /** Must match Storage bucket id in the same Supabase project as supabaseUrl */
    sowFilesBucket: process.env.EXPO_PUBLIC_SOW_BUCKET || 'sow-files',
    /** UiTM MyStudent Firebase API key (Identity Toolkit Web API). */
    firebaseWebApiKey: process.env.EXPO_PUBLIC_FIREBASE_WEB_API_KEY || '',
  },
  };
};
