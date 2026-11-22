const path = require('path');
const fs = require('fs');
const { getDefaultConfig } = require('expo/metro-config');

// Direct temp directory to local workspace on Windows to prevent
// Windows Defender / antivirus file-locking collisions in %TEMP% during hermesc bytecode generation.
if (process.platform === 'win32') {
  const localTmpDir = path.join(__dirname, '.expo', 'tmp');
  try {
    fs.mkdirSync(localTmpDir, { recursive: true });
    process.env.TEMP = localTmpDir;
    process.env.TMP = localTmpDir;
  } catch {}
}

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