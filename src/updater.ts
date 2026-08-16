import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform, Linking } from 'react-native';
import Constants from 'expo-constants';

export const GITHUB_REPO = 'fozzoi/Watcher';

export interface ReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
  content_type: string;
}

export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  assets: ReleaseAsset[];
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  publishedAt: string;
  apkUrl: string | null;
  apkSize: number;
}

/**
 * Fetch latest release metadata from public GitHub repository
 */
export const fetchLatestGitHubRelease = async (): Promise<GitHubRelease | null> => {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        console.log('No GitHub releases published yet.');
        return null;
      }
      throw new Error(`GitHub API returned status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch latest GitHub release:', error);
    return null;
  }
};

/**
 * Compare current version with latest release
 */
export const checkForAppUpdate = async (): Promise<UpdateCheckResult> => {
  const currentVersion = Constants.expoConfig?.version || '3.0.0';
  const release = await fetchLatestGitHubRelease();

  if (!release) {
    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: currentVersion,
      releaseName: '',
      releaseNotes: '',
      publishedAt: '',
      apkUrl: null,
      apkSize: 0,
    };
  }

  const apkAsset = release.assets.find(
    (asset) => asset.name.endsWith('.apk')
  );

  const cleanLatestTag = release.tag_name.replace(/^v/i, '').trim();
  const cleanCurrentVer = currentVersion.replace(/^v/i, '').trim();

  // Version comparison: If tags differ or latest build number is greater
  const updateAvailable = cleanLatestTag !== cleanCurrentVer && isVersionNewer(cleanLatestTag, cleanCurrentVer);

  return {
    updateAvailable,
    currentVersion,
    latestVersion: release.tag_name,
    releaseName: release.name || release.tag_name,
    releaseNotes: release.body || '',
    publishedAt: release.published_at,
    apkUrl: apkAsset ? apkAsset.browser_download_url : null,
    apkSize: apkAsset ? apkAsset.size : 0,
  };
};

/**
 * Helper to check if remote version is newer than local version
 */
const isVersionNewer = (remote: string, local: string): boolean => {
  if (remote === local) return false;
  const rParts = remote.split('.').map((p) => parseInt(p, 10) || 0);
  const lParts = local.split('.').map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(rParts.length, lParts.length);
  for (let i = 0; i < maxLen; i++) {
    const r = rParts[i] || 0;
    const l = lParts[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
};

/**
 * Download APK file with real-time progress tracking and trigger Android package installer
 */
export const downloadAndInstallApk = async (
  downloadUrl: string,
  onProgress?: (progressFraction: number) => void
): Promise<void> => {
  if (Platform.OS !== 'android') {
    await Linking.openURL(downloadUrl);
    return;
  }

  const localFileUri = FileSystem.cacheDirectory + 'TheWatcher_Update.apk';

  // Ensure any previous file is removed
  try {
    const info = await FileSystem.getInfoAsync(localFileUri);
    if (info.exists) {
      await FileSystem.deleteAsync(localFileUri, { idempotent: true });
    }
  } catch {}

  const downloadResumable = FileSystem.createDownloadResumable(
    downloadUrl,
    localFileUri,
    {},
    (downloadProgress) => {
      const progress =
        downloadProgress.totalBytesWritten /
        downloadProgress.totalBytesExpectedToWrite;
      if (onProgress) {
        onProgress(Math.min(1, Math.max(0, progress)));
      }
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result || !result.uri) {
    throw new Error('APK download failed.');
  }

  // Get content URI for Android Package Installer
  const contentUri = await FileSystem.getContentUriAsync(result.uri);

  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
};
