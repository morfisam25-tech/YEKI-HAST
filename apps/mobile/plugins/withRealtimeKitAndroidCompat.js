// @cloudflare/realtimekit-react-native's own AndroidManifest.xml
// (node_modules/@cloudflare/realtimekit-react-native/android/src/main/AndroidManifest.xml)
// contributes two things the merged, real (non-Expo-managed) Android build
// needs corrected -- neither is visible to `expo config --type introspect`,
// only to a real Gradle build, which is how this was actually found (see
// W86B build aacf08db-e410-47cf-a3d5-5bb121ed67bf's initial failure):
//
// 1. <provider android:authorities="@string/blob_provider_authority"> for
//    React Native core's BlobModule -- the string resource itself is never
//    defined anywhere (not even by react-native's own template), so AAPT
//    link fails at build time. Must be globally unique per app.
// 2. <uses-feature android:name="android.hardware.camera" /> with no
//    `required` attribute, which Android defaults to `required="true"`.
//    This app's calls are audio-only (Voice-preset RealtimeKit, W60) and
//    android.permission.CAMERA is deliberately blocked in app.json -- a
//    hard camera requirement would make Google Play hide the app from
//    every camera-less device for a feature it never uses. Overridden to
//    `required="false"` (`tools:node="replace"` so it replaces the
//    library's entry instead of producing a duplicate).
const { withStringsXml, withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

function withBlobProviderAuthority(config) {
  return withStringsXml(config, (config) => {
    const packageName = config.android?.package ?? 'app.yekihast.mobile';
    config.modResults = AndroidConfig.Strings.setStringItem(
      [
        {
          $: { name: 'blob_provider_authority', translatable: 'false' },
          _: `${packageName}.blobprovider`,
        },
      ],
      config.modResults,
    );
    return config;
  });
}

function withOptionalCameraFeature(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = AndroidConfig.Manifest.ensureToolsAvailable(config.modResults);
    const manifestRoot = manifest.manifest;
    manifestRoot['uses-feature'] = (manifestRoot['uses-feature'] ?? []).filter(
      (item) => item.$['android:name'] !== 'android.hardware.camera',
    );
    manifestRoot['uses-feature'].push({
      $: {
        'android:name': 'android.hardware.camera',
        'android:required': 'false',
        'tools:node': 'replace',
      },
    });
    config.modResults = manifest;
    return config;
  });
}

module.exports = (config) => withOptionalCameraFeature(withBlobProviderAuthority(config));
