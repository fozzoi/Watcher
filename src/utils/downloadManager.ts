import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import { Alert, ToastAndroid, Platform } from 'react-native';

export type DownloadStatus = 'Extracting' | 'Downloading' | 'Completed' | 'Error';

export interface DownloadItem {
  id: string;
  title: string;
  progress: number;
  status: DownloadStatus;
  speed: string;
  url: string;
  logs: string[];
  fileUri?: string;
}

class DownloadManagerStore {
  downloads: Record<string, DownloadItem> = {};
  listeners: Set<() => void> = new Set();
  
  // Track previous bytes to calculate speed
  private lastBytesMap: Record<string, { bytes: number; timestamp: number }> = {};
  private lastNotifyTime = 0;
  private notifyTimeout: any = null;
  
  // Keep track of active resumables to cancel them if removed
  activeResumables: Record<string, FileSystem.DownloadResumable> = {};

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Throttled notify to prevent "Maximum update depth exceeded" infinite loops
  private notify() {
    const now = Date.now();
    if (now - this.lastNotifyTime > 300) {
      this.lastNotifyTime = now;
      this.listeners.forEach(l => l());
      if (this.notifyTimeout) {
        clearTimeout(this.notifyTimeout);
        this.notifyTimeout = null;
      }
    } else if (!this.notifyTimeout) {
      this.notifyTimeout = setTimeout(() => {
        this.lastNotifyTime = Date.now();
        this.listeners.forEach(l => l());
        this.notifyTimeout = null;
      }, 300);
    }
  }

  getDownloads(): DownloadItem[] {
    return Object.values(this.downloads);
  }

  removeDownload(id: string) {
    const item = this.downloads[id];
    if (item) {
      if (item.fileUri) {
        FileSystem.deleteAsync(item.fileUri, { idempotent: true }).catch(() => {});
      }
      if (this.activeResumables[id]) {
        this.activeResumables[id].pauseAsync().catch(() => {});
        delete this.activeResumables[id];
      }
      delete this.downloads[id];
      this.notify();
    }
  }

  addOrUpdateDownload(id: string, update: Partial<DownloadItem>) {
    if (this.downloads[id]) {
      this.downloads[id] = { ...this.downloads[id], ...update };
    } else {
      this.downloads[id] = {
        id,
        title: update.title || 'Unknown',
        progress: update.progress || 0,
        status: update.status || 'Downloading',
        speed: update.speed || '0 KB/s',
        url: update.url || '',
        logs: update.logs || []
      };
    }
    this.notify();
  }

  addLog(id: string, message: string) {
    if (this.downloads[id]) {
      console.log(`[DownloadManager ${id}] ${message}`);
      this.downloads[id].logs = [...(this.downloads[id].logs || []), message];
      this.notify();
    }
  }

  calculateSpeed(id: string, currentBytes: number): string {
    const now = Date.now();
    const last = this.lastBytesMap[id];
    
    if (!last) {
      this.lastBytesMap[id] = { bytes: currentBytes, timestamp: now };
      return '0 KB/s';
    }

    const timeDiff = (now - last.timestamp) / 1000; // in seconds
    if (timeDiff >= 1) { // Update speed every second
      const bytesDiff = currentBytes - last.bytes;
      const speedKBps = bytesDiff / 1024 / timeDiff;
      
      this.lastBytesMap[id] = { bytes: currentBytes, timestamp: now };
      
      if (speedKBps > 1024) {
        return `${(speedKBps / 1024).toFixed(2)} MB/s`;
      }
      return `${speedKBps.toFixed(2)} KB/s`;
    }
    return this.downloads[id]?.speed || '0 KB/s';
  }
}

export const DownloadStore = new DownloadManagerStore();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});



export const startDownload = async (videoUrl: string, fileName: string, overrideId?: string) => {
  const downloadId = overrideId || Date.now().toString();
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Storage permissions are needed to save downloads.');
      return;
    }

    await Notifications.requestPermissionsAsync();

    const cleanFileName = fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileUri = `${FileSystem.documentDirectory}${cleanFileName}.mp4`;
    
    DownloadStore.addOrUpdateDownload(downloadId, {
      title: fileName,
      progress: 0,
      status: 'Downloading',
      url: videoUrl,
      speed: '0 KB/s',
      id: downloadId,
      fileUri: fileUri
    });

    if (Platform.OS === 'android') {
      ToastAndroid.show('Download started...', ToastAndroid.SHORT);
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Download Started',
        body: `Downloading: ${fileName}`,
      },
      trigger: null,
    });

    if (videoUrl.includes('.m3u8')) {
      // HLS (.m3u8) streaming downloads require native FFmpeg binaries which are
      // no longer available (ffmpeg-kit retired April 2025). Treating as unsupported.
      DownloadStore.addOrUpdateDownload(downloadId, { status: 'Error', speed: '0 KB/s' });
      DownloadStore.addLog(downloadId, `HLS stream downloads are not supported in this version.`);
      Alert.alert(
        'HLS Not Supported',
        'Downloading HLS (.m3u8) streams is not supported. Please try a direct video link instead.'
      );
      return;
    } else {
      const downloadResumable = FileSystem.createDownloadResumable(
        videoUrl,
        fileUri,
        {},
        async (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          const speed = DownloadStore.calculateSpeed(downloadId, downloadProgress.totalBytesWritten);
          
          DownloadStore.addOrUpdateDownload(downloadId, {
            progress: progress,
            speed: speed,
          });
        }
      );

      DownloadStore.activeResumables[downloadId] = downloadResumable;
      const result = await downloadResumable.downloadAsync();
      delete DownloadStore.activeResumables[downloadId];
      
      if (result?.uri) {
        await MediaLibrary.saveToLibraryAsync(result.uri);
        DownloadStore.addOrUpdateDownload(downloadId, { progress: 1, status: 'Completed', speed: '0 KB/s' });

        await Notifications.scheduleNotificationAsync({
          content: { title: 'Download Complete! 🎉', body: `${fileName} has been saved to your gallery.` },
          trigger: null,
        });

        if (Platform.OS === 'android') {
          ToastAndroid.show('Download complete!', ToastAndroid.SHORT);
        }
      }
    }
  } catch (error) {
    console.error('Download error:', error);
    DownloadStore.addOrUpdateDownload(downloadId, { status: 'Error', speed: '0 KB/s' });
    DownloadStore.addLog(downloadId, `Download failed: ${error}`);
    Alert.alert('Download Error', `Failed to download ${fileName}.`);
  }
};

export const addDownloadTask = (title: string, url: string, isDirect: boolean, initialLogs: string[] = []) => {
  const downloadId = Date.now().toString();
  DownloadStore.addOrUpdateDownload(downloadId, {
    id: downloadId,
    title: title,
    progress: 0,
    status: isDirect ? 'Downloading' : 'Extracting',
    url: url,
    speed: '0 KB/s',
    logs: initialLogs
  });
  
  if (isDirect) {
    startDownload(url, title, downloadId);
  }
};