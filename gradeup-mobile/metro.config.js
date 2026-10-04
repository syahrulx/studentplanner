const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('lottie')) {
  config.resolver.assetExts.push('lottie');
}

// PDF.js ships ES modules only, and Android's WebView cannot display a PDF on
// its own, so the viewer loads these two files from disk. They are copied in
// under a bespoke extension rather than kept as .mjs: adding 'mjs' to assetExts
// would make Metro treat every .mjs in node_modules as an asset and break the
// packages that ship ESM.
if (!config.resolver.assetExts.includes('pdfjs')) {
  config.resolver.assetExts.push('pdfjs');
}

// ---------------------------------------------------------------------------
// Web: alias native-only packages (no web build) to a harmless empty stub so
// the web bundle never tries to resolve their native code. Runtime usage is
// additionally guarded by Platform.OS checks and `.web.tsx` overrides.
// ---------------------------------------------------------------------------
const NATIVE_ONLY_WEB_STUBS = [
  'react-native-purchases',
  '@rnmapbox/maps',
  'react-native-webview',
  'react-native-image-crop-picker',
  'expo-widgets',
];

const nativeStub = path.resolve(__dirname, 'web-shims/native-stub.js');
const tslibEs6 = require.resolve('tslib/tslib.es6.js');
const previousResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // pdf-lib (and other CJS libs) break on web when Metro resolves tslib/modules.
  if (platform === 'web' && moduleName === 'tslib') {
    return { type: 'sourceFile', filePath: tslibEs6 };
  }
  if (platform === 'web' && NATIVE_ONLY_WEB_STUBS.includes(moduleName)) {
    return { type: 'sourceFile', filePath: nativeStub };
  }
  if (previousResolveRequest) {
    return previousResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
