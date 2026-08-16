import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Linking } from 'react-native';
import Constants from 'expo-constants';

export const GITHUB_REPO = 'fozzoi/Watcher';
const NOTIFY_UPDATES_KEY = 'settings_notify_updates';
const LAST_NOTIFIED_TAG_KEY = 'last_notified_release_tag';

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
 * Check if the user has enabled update notifications
 */
export const isUpdateNotificationEnabled = async (): Promise<boolean> => {
  try {
    const val = await AsyncStorage.getItem(NOTIFY_UPDATES_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
};

/**
 * Enable or disable update notifications
 */
export const setUpdateNotificationEnabled = async (enabled: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(NOTIFY_UPDATES_KEY, enabled ? 'true' : 'false');
  } catch (e) {
    console.error('Failed to save update notification setting:', e);
  }
};

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
 * Send an Android system notification for a new app release
 */
export const sendUpdateNotification = async (update: UpdateCheckResult): Promise<void> => {
  try {
    const enabled = await isUpdateNotificationEnabled();
    if (!enabled) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('watcher-app-updates', {
        name: 'App Updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#E50914',
      });
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🚀 Update Available: ${update.latestVersion}`,
        body: `A new version of Watcher is ready to install with fresh features & improvements. Tap to update.`,
        data: {
          isAppUpdate: true,
          releaseInfo: update,
        },
        sound: true,
      },
      trigger: null, // send immediately
    });

    await AsyncStorage.setItem(LAST_NOTIFIED_TAG_KEY, update.latestVersion);
  } catch (error) {
    console.error('Failed to trigger update notification:', error);
  }
};

/**
 * Check for updates and automatically notify if enabled and not already notified
 */
export const checkAndNotifyUpdate = async (): Promise<UpdateCheckResult | null> => {
  try {
    const enabled = await isUpdateNotificationEnabled();
    if (!enabled) return null;

    const result = await checkForAppUpdate();
    if (result.updateAvailable) {
      const lastNotified = await AsyncStorage.getItem(LAST_NOTIFIED_TAG_KEY);
      if (lastNotified !== result.latestVersion) {
        await sendUpdateNotification(result);
      }
      return result;
    }
    return null;
  } catch (error) {
    console.error('Auto update check failed:', error);
    return null;
  }
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

  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 268435457, // FLAG_GRANT_READ_URI_PERMISSION (1) | FLAG_ACTIVITY_NEW_TASK (268435456)
      type: 'application/vnd.android.package-archive',
    });
  } catch (intentErr) {
    console.warn('Direct intent launcher failed, falling back to browser/downloader:', intentErr);
    await Linking.openURL(downloadUrl);
  }
};
