import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import { Alert, ToastAndroid, Platform } from 'react-native';

// Configure notifications to show up even when the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const startDownload = async (videoUrl: string, fileName: string) => {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Storage permissions are needed to save downloads.');
      return;
    }

    // Request notification permissions
    await Notifications.requestPermissionsAsync();

    const cleanFileName = fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileUri = `${FileSystem.documentDirectory}${cleanFileName}.mp4`;
    
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

    const downloadResumable = FileSystem.createDownloadResumable(
      videoUrl,
      fileUri,
      {},
      (downloadProgress) => {
        const progress = (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100;
        console.log(`Download progress: ${progress.toFixed(2)}%`);
      }
    );

    const result = await downloadResumable.downloadAsync();
    
    if (result?.uri) {
      await MediaLibrary.saveToLibraryAsync(result.uri);
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Download Complete! 🎉',
          body: `${fileName} has been saved to your gallery.`,
        },
        trigger: null,
      });

      if (Platform.OS === 'android') {
        ToastAndroid.show('Download complete!', ToastAndroid.SHORT);
      } else {
        Alert.alert('Success', 'Video saved to your device.');
      }
    }
  } catch (error) {
    console.error('Download error:', error);
    Alert.alert('Error', 'Failed to download the file.');
  }
};