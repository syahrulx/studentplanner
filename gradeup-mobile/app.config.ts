import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name || 'Rencana',
  slug: config.slug || 'gradeup-mobile',
  plugins: [
    ...(config.plugins || []).filter(p => Array.isArray(p) ? p[0] !== '@rnmapbox/maps' : p !== '@rnmapbox/maps'),
    [
      "@rnmapbox/maps",
      {
        "RNMapboxMapsDownloadToken": process.env.MAPBOX_DOWNLOAD_TOKEN || "PLACEHOLDER"
      }
    ]
  ]
});
