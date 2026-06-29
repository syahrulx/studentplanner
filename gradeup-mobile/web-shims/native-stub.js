// Empty stub used on web for native-only packages that have no web build
// (e.g. react-native-purchases, @rnmapbox/maps, react-native-webview).
//
// Metro aliases those packages to this file when bundling for the web platform
// (see metro.config.js). Code that still references them at runtime must be
// guarded by `Platform.OS` checks or use a `.web.tsx` override so it never
// actually touches these stubbed exports on web.
//
// We use a Proxy so that any named/default import resolves to a harmless no-op
// instead of throwing at module-eval time.

function noop() {
  return undefined;
}

const handler = {
  get(_target, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'default') return stub;
    // Return a callable no-op for any property access so destructured
    // imports (e.g. `import { Foo } from 'pkg'`) don't crash.
    return stub;
  },
  apply() {
    return undefined;
  },
  construct() {
    return {};
  },
};

const stub = new Proxy(noop, handler);

module.exports = stub;
module.exports.default = stub;
