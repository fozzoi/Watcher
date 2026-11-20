const { withGradleProperties } = require('@expo/config-plugins');

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (config) => {
    const props = [
      { key: 'org.gradle.jvmargs', value: '-Xmx2048m -XX:MaxMetaspaceSize=512m -XX:+UseG1GC' },
      { key: 'org.gradle.parallel', value: 'false' },
      { key: 'org.gradle.workers.max', value: '1' },
      // The Kotlin daemon defaults to 2GB on top of Gradle's 2GB. On an 8GB
      // machine that is what pushes the build into swap and stalls it.
      { key: 'kotlin.daemon.jvmargs', value: '-Xmx768m' },
      // Compile C/C++ with one job: CMake + Ninja otherwise fan out as many
      // processes as cores and exhaust memory on Skia/Reanimated.
      { key: 'org.gradle.configuration-cache', value: 'false' },
      // Windows caps any single path at 260 chars. Expo raises CMake's
      // object-path limit to 1024, so deep modules (react-native-reanimated
      // mirrors its whole Common/cpp tree into .cxx) produce 265+ char object
      // paths and ninja dies with "mkdir: No such file or directory".
      // CMake hashes an object path only when dir + name > this limit, and it
      // can only hash at a '/' boundary within (limit - dir - 32) chars of the
      // end. 256 is the sweet spot: 250 leaves rngesturehandler's 40-char
      // filename 1 char out of reach (path stays 367 chars), while >=260 lets
      // long paths through and ninja (MAX_PATH 260) rejects them.
      { key: 'expo.android.cmakeObjectPathMax', value: '256' },
    ];

    for (const { key, value } of props) {
      const existing = config.modResults.find(
        (item) => item.type === 'property' && item.key === key
      );
      if (existing) {
        existing.value = value;
      } else {
        config.modResults.push({ type: 'property', key, value });
      }
    }
    return config;
  });
};
