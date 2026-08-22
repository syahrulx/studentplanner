const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const release = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

const errors = [];
if (!/^\d+\.\d+\.\d+$/.test(String(release.version))) {
  errors.push('release.json version must use semantic versioning, for example 1.6.8.');
}
if (!/^\d+$/.test(String(release.iosBuildNumber)) || Number(release.iosBuildNumber) < 1) {
  errors.push('release.json iosBuildNumber must be a positive integer string.');
}
if (!Number.isInteger(release.androidVersionCode) || release.androidVersionCode < 1) {
  errors.push('release.json androidVersionCode must be a positive integer.');
}
if (pkg.version !== release.version) {
  errors.push(`package.json version ${pkg.version} does not match release.json ${release.version}.`);
}
if (lock.version !== release.version || lock.packages?.['']?.version !== release.version) {
  errors.push('package-lock.json root version does not match release.json. Run npm install --package-lock-only after changing a release.');
}

if (errors.length) {
  console.error(`Release validation failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log(`Release ${release.version} validated (iOS ${release.iosBuildNumber}, Android ${release.androidVersionCode}).`);
