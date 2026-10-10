const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const previousGetTransformOptions = config.transformer?.getTransformOptions;

// Enable inlineRequires for lazy module evaluation (reduces startup time & initial RAM)
config.transformer.getTransformOptions = async () => {
  const defaultOptions = previousGetTransformOptions
    ? await previousGetTransformOptions()
    : {};

  return {
    ...defaultOptions,
    transform: {
      ...defaultOptions.transform,
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  };
};

module.exports = config;