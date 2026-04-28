const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('lottie')) {
  config.resolver.assetExts.push('lottie');
}

module.exports = config;
