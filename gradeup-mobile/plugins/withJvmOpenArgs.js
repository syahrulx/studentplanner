/**
 * Expo config plugin that patches android/gradle.properties with JVM --add-opens flags.
 * Required on Java 17/21 to avoid "restricted method in java.lang.System has been called"
 * errors when CMake configures native modules (react-native-screens, react-native-worklets).
 */
const { withGradleProperties } = require('@expo/config-plugins');

const JVM_ARGS = [
  '-Xmx2048m',
  '-XX:MaxMetaspaceSize=512m',
  '--add-opens=java.base/java.lang=ALL-UNNAMED',
  '--add-opens=java.base/java.util=ALL-UNNAMED',
  '--add-opens=java.base/java.io=ALL-UNNAMED',
].join(' ');

module.exports = function withJvmOpenArgs(config) {
  return withGradleProperties(config, (gradleConfig) => {
    const props = gradleConfig.modResults;

    // Find existing jvmargs entry and replace it
    const existing = props.find(
      (item) => item.type === 'property' && item.key === 'org.gradle.jvmargs'
    );

    if (existing) {
      existing.value = JVM_ARGS;
    } else {
      props.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
    }

    return gradleConfig;
  });
};
