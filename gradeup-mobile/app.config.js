export default ({ config }) => ({
  ...config,
  extra: {
    ...config?.extra,
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY || '',
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://ujxrtuogdialsrzxkcey.supabase.co',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_KEY || 'sb_publishable_BP84hlaptaMf1vDRwfnwgQ_dhUk0EL7',
    openaiApiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY || '',
    spotifyClientId: process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID || '',
  },
});
