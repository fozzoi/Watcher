import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Switch, Platform, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing'; 
import * as DocumentPicker from 'expo-document-picker'; 
import AsyncStorage from '@react-native-async-storage/async-storage'; 
import { getSavedItems, addSavedItem } from '../src/database'; 

import { Feather, Ionicons } from '@expo/vector-icons';
import { setGlobalConfig } from '../src/tmdb';
import { resetOnboarding } from '../src/userPreferences';
import Constants from 'expo-constants';
import { isNotificationsEnabled, setNotificationsEnabled, sendTestNotification } from '../src/notifications';
import { getCachedPushToken, sendTestRemotePushNotification } from '../src/pushNotifications';
import { checkForAppUpdate, isUpdateNotificationEnabled, setUpdateNotificationEnabled, UpdateCheckResult } from '../src/updater';
import AppUpdateModal from '../src/components/shared/AppUpdateModal';
import { ThemedDialog, DialogButton } from '../src/components/shared/ThemedDialog';
import { ActivityIndicator } from 'react-native';

interface DialogConfig {
  visible: boolean;
  title: string;
  message?: string;
  type?: 'info' | 'success' | 'warning' | 'danger';
  buttons?: DialogButton[];
  iconName?: string;
}

const Settings = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = 60; 

  const [isHiRes, setIsHiRes] = useState(false);
  const [isNsfwFilter, setIsNsfwFilter] = useState(true);
  const [isSmartNotifs, setIsSmartNotifs] = useState(true);
  const [isUpdateNotifs, setIsUpdateNotifs] = useState(true);
  
  // App Update States
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [updateModalVisible, setUpdateModalVisible] = useState(false);

  // Themed Dialog State
  const [dialogConfig, setDialogConfig] = useState<DialogConfig>({
    visible: false,
    title: '',
  });

  const showDialog = (config: Omit<DialogConfig, 'visible'>) => {
    setDialogConfig({ ...config, visible: true });
  };
  
  const appVersion = Constants.expoConfig?.version || '3.0.0';

  useEffect(() => {
    loadSettings();
    handleCheckUpdate(true); // Silent check on mount
  }, []);

  const loadSettings = async () => {
    try {
      const savedHiRes = await AsyncStorage.getItem('settings_hires');
      const savedNsfw = await AsyncStorage.getItem('settings_nsfw');
      const notifsEnabled = await isNotificationsEnabled();
      const updateNotifsEnabled = await isUpdateNotificationEnabled();
      
      setIsSmartNotifs(notifsEnabled);
      setIsUpdateNotifs(updateNotifsEnabled);
      
      if (savedHiRes !== null) {
        const val = JSON.parse(savedHiRes);
        setIsHiRes(val);
        setGlobalConfig('hiRes', val);
      }
      if (savedNsfw !== null) {
        const val = JSON.parse(savedNsfw);
        setIsNsfwFilter(val);
        setGlobalConfig('nsfwFilterEnabled', val);
      }
    } catch (e) { console.log("Failed to load settings"); }
  };

  const toggleHiRes = async (value: boolean) => {
    setIsHiRes(value);
    setGlobalConfig('hiRes', value);
    await AsyncStorage.setItem('settings_hires', JSON.stringify(value));
  };

  const toggleNsfw = async (value: boolean) => {
    setIsNsfwFilter(value);
    setGlobalConfig('nsfwFilterEnabled', value);
    await AsyncStorage.setItem('settings_nsfw', JSON.stringify(value));
  };

  const toggleSmartNotifs = async (value: boolean) => {
    setIsSmartNotifs(value);
    await setNotificationsEnabled(value);
  };

  const toggleUpdateNotifs = async (value: boolean) => {
    setIsUpdateNotifs(value);
    await setUpdateNotificationEnabled(value);
  };

  const handleTestNotif = async () => {
    try {
      const token = await getCachedPushToken();
      if (token) {
        await sendTestRemotePushNotification();
        showDialog({
          title: "Remote Push Sent! 🍿",
          message: "Remote notification sent via Expo Push API. It will appear in your notification tray even when the app is closed.",
          type: "success",
        });
      } else {
        await sendTestNotification();
        showDialog({
          title: "Local Notification Triggered 🍿",
          message: "Local test notification triggered. Run on a physical device with permissions granted to register for remote push.",
          type: "info",
        });
      }
    } catch (e: any) {
      showDialog({
        title: "Notification Error",
        message: e.message || "Failed to trigger notification. Make sure permissions are granted.",
        type: "warning",
      });
    }
  };

  // APP UPDATE LOGIC
  const handleCheckUpdate = async (silent = false) => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      const result = await checkForAppUpdate();
      setUpdateResult(result);
      if (!silent) {
        if (result.updateAvailable) {
          setUpdateModalVisible(true);
        } else {
          showDialog({
            title: "Up to Date! ✨",
            message: `You are on the latest version of Watcher (v${appVersion}).`,
            type: "success",
          });
        }
      }
    } catch (e) {
      if (!silent) {
        showDialog({
          title: "Update Check Failed",
          message: "Could not connect to GitHub Releases. Please check your internet connection.",
          type: "warning",
        });
      }
    } finally {
      setCheckingUpdate(false);
    }
  };

  // EXPORT LOGIC
  const handleExportPrompt = () => {
    showDialog({
      title: "Export Library",
      message: "Choose a format to export your Watchlist, Artists, and Watched History.",
      type: "info",
      buttons: [
        { text: "Export as .TXT", style: "primary", onPress: () => performExport('txt') },
        { text: "Export as .JSON", style: "primary", onPress: () => performExport('json') },
        { text: "Cancel", style: "cancel" },
      ]
    });
  };

  const performExport = async (format: 'txt' | 'json') => {
    try {
      const rawWatchlist = getSavedItems('watchlist');
      const rawArtists = getSavedItems('artist');
      const rawHistory = getSavedItems('history');

      let fileContent = "";
      const dateString = new Date().toISOString().split('T')[0];
      const fileName = format === 'json' ? `Watcher_Backup_${dateString}.json` : `Watcher_Backup_${dateString}.txt`;

      if (format === 'json') {
        fileContent = JSON.stringify({ watchlist: rawWatchlist, artists: rawArtists, history: rawHistory }, null, 2);
      } else {
        fileContent += "movies\n";
        rawWatchlist.forEach((i: any, index: number) => {
          const year = i.release_date || i.first_air_date ? String(i.release_date || i.first_air_date).substring(0, 4) : '';
          fileContent += `${index + 1} ${i.title || i.name}${year ? ` ${year}` : ''}\n`;
        });
        fileContent += "\nartist\n";
        rawArtists.forEach((i: any, index: number) => {
          fileContent += `${index + 1} ${i.name}\n`;
        });
        fileContent += "\nwatched\n";
        rawHistory.forEach((i: any, index: number) => {
          const year = i.release_date || i.first_air_date ? String(i.release_date || i.first_air_date).substring(0, 4) : '';
          fileContent += `${index + 1} ${i.title || i.name}${year ? ` ${year}` : ''}\n`;
        });
      }

      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, fileContent, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: format === 'json' ? 'application/json' : 'text/plain', dialogTitle: 'Export Watcher Data' });
      } else {
        showDialog({
          title: "Error",
          message: "Sharing is not available on this device.",
          type: "warning",
        });
      }
    } catch (error) {
      showDialog({
        title: "Export Failed",
        message: "There was an error generating your backup file.",
        type: "danger",
      });
    }
  };

  // RESTORE LOGIC
  const handleRestoreBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const fileUri = result.assets[0].uri;
      const response = await fetch(fileUri);
      const fileContent = await response.text();
      const backupData = JSON.parse(fileContent);

      let restoredTotal = 0;
      if (backupData.watchlist && Array.isArray(backupData.watchlist)) {
        backupData.watchlist.forEach((i: any) => addSavedItem(i, 'watchlist'));
        restoredTotal += backupData.watchlist.length;
      }
      if (backupData.artists && Array.isArray(backupData.artists)) {
        backupData.artists.forEach((i: any) => addSavedItem(i, 'artist'));
        restoredTotal += backupData.artists.length;
      }
      if (backupData.history && Array.isArray(backupData.history)) {
        backupData.history.forEach((i: any) => addSavedItem(i, 'history'));
        restoredTotal += backupData.history.length;
      }

      if (restoredTotal > 0) {
        showDialog({
          title: "Backup Restored! 🎉",
          message: `Successfully restored ${restoredTotal} items.\n\nGo back to your Library to see them.`,
          type: "success",
        });
      } else {
        showDialog({
          title: "Invalid File",
          message: "This JSON file does not contain valid Watcher backup data.",
          type: "warning",
        });
      }
    } catch (error) {
      showDialog({
        title: "Restore Failed",
        message: "Make sure you selected a valid Watcher Backup .json file.",
        type: "danger",
      });
    }
  };

  const handleClearCache = async () => {
    showDialog({
      title: "Clear Cache",
      message: "Are you sure? Images will reload next time.",
      type: "danger",
      buttons: [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Clear Cache", 
          style: "destructive",
          onPress: async () => {
            const cacheDir = FileSystem.cacheDirectory;
            if (cacheDir) {
              await FileSystem.deleteAsync(cacheDir, { idempotent: true });
              await FileSystem.makeDirectoryAsync(cacheDir);
              showDialog({
                title: "Cache Cleared",
                message: "Temporary cache files have been cleared.",
                type: "success",
              });
            }
          }
        }
      ]
    });
  };

  const handleResetPreferences = async () => {
    showDialog({
      title: "Reset Preferences",
      message: "This will clear your saved languages, genres, and favorite actors. The app will restart to show the setup screen.",
      type: "danger",
      buttons: [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Reset All", 
          style: "destructive",
          onPress: async () => {
            await resetOnboarding();
            showDialog({
              title: "Preferences Reset",
              message: "Preferences have been reset. Please restart the app.",
              type: "success",
            });
          }
        }
      ]
    });
  };

  // ── Reusable row components ──

  const ToggleRow = ({ title, subtitle, value, onValueChange }: any) => (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Switch 
        trackColor={{ false: '#3A3A3C', true: '#E50914' }} 
        thumbColor="#FFFFFF"
        onValueChange={onValueChange} 
        value={value} 
      />
    </View>
  );

  const ActionRow = ({ title, subtitle, onPress, destructive }: any) => (
    <TouchableOpacity activeOpacity={0.6} onPress={onPress} style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, destructive && styles.destructiveText]}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={20} color="#3A3A3C" />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ paddingBottom: tabBarHeight + 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.header}>Settings</Text>

        {/* ── Content ── */}
        <Text style={styles.sectionLabel}>CONTENT</Text>
        <View style={styles.card}>
          <ToggleRow 
            title="Hi-Res Posters" 
            subtitle="Higher quality images (uses more data)" 
            value={isHiRes} 
            onValueChange={toggleHiRes} 
          />
          <View style={styles.separator} />
          <ToggleRow 
            title="NSFW Filter" 
            subtitle="Hide explicit and adult content" 
            value={isNsfwFilter} 
            onValueChange={toggleNsfw} 
          />
          <View style={styles.separator} />
          <ActionRow 
            title="Change Content Preferences" 
            subtitle="Update your languages, genres and favorite actors" 
            onPress={() => router.push('/onboarding')} 
          />
        </View>

        {/* ── Notifications ── */}
        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
        <View style={styles.card}>
          <ToggleRow 
            title="Smart Release Alerts" 
            subtitle="Notify for new episodes & movie premiere dates" 
            value={isSmartNotifs} 
            onValueChange={toggleSmartNotifs} 
          />
          <View style={styles.separator} />
          <ActionRow 
            title="Send Test Notification" 
            subtitle="Verify background notifications on this device" 
            onPress={handleTestNotif} 
          />
        </View>

        {/* ── App Updates ── */}
        <Text style={styles.sectionLabel}>UPDATES</Text>
        <View style={styles.card}>
          <ToggleRow 
            title="Notify on New Updates" 
            subtitle="Show popup and notifications when a new version is released" 
            value={isUpdateNotifs} 
            onValueChange={toggleUpdateNotifs} 
          />
          <View style={styles.separator} />
          <TouchableOpacity 
            activeOpacity={0.7} 
            onPress={() => {
              if (updateResult?.updateAvailable) {
                setUpdateModalVisible(true);
              } else {
                handleCheckUpdate(false);
              }
            }} 
            style={styles.row}
          >
            <View style={styles.rowText}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.rowTitle}>Check for Updates</Text>
                {updateResult?.updateAvailable && (
                  <View style={styles.badgeNew}>
                    <Text style={styles.badgeNewText}>NEW</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.rowSubtitle, updateResult?.updateAvailable && { color: '#30D158' }]}>
                {checkingUpdate 
                  ? "Checking GitHub for updates..." 
                  : updateResult?.updateAvailable 
                    ? `Update available: ${updateResult.latestVersion}` 
                    : `Version ${appVersion} (Latest)`}
              </Text>
            </View>
            {checkingUpdate ? (
              <ActivityIndicator size="small" color="#E50914" />
            ) : (
              <Feather name="refresh-cw" size={18} color="#8E8E93" />
            )}
          </TouchableOpacity>
        </View>

        {/* ── Data & Storage ── */}
        <Text style={styles.sectionLabel}>DATA & STORAGE</Text>
        <View style={styles.card}>
          <ActionRow 
            title="Export Library" 
            subtitle="Save Watchlist & History to your phone" 
            onPress={handleExportPrompt} 
          />
          <View style={styles.separator} />
          <ActionRow 
            title="Restore Backup" 
            subtitle="Import from a .json backup file" 
            onPress={handleRestoreBackup} 
          />
          <View style={styles.separator} />
          <ActionRow 
            title="Clear Cache" 
            subtitle="Free up local storage space" 
            onPress={handleClearCache} 
            destructive
          />
        </View>

        <Text style={styles.version}>Watcher v{appVersion}</Text>
      </ScrollView>

      {/* ── Reusable Update Dialog Modal ── */}
      <AppUpdateModal
        visible={updateModalVisible}
        onClose={() => setUpdateModalVisible(false)}
        updateResult={updateResult}
      />

      {/* ── Themed Dialog & Alert ── */}
      <ThemedDialog
        visible={dialogConfig.visible}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
        buttons={dialogConfig.buttons}
        iconName={dialogConfig.iconName}
        onClose={() => setDialogConfig(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    fontSize: 28,
    fontFamily: 'GoogleSansFlex-Bold',
    color: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex-Medium',
    color: '#666',
    letterSpacing: 1,
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#1C1C1E',
    marginHorizontal: 16,
    borderRadius: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 60,
  },
  rowText: {
    flex: 1,
    paddingRight: 16,
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex-Medium',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  rowSubtitle: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex-Regular',
    color: '#8E8E93',
    lineHeight: 16,
  },
  destructiveText: {
    color: '#E50914',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#38383A',
    marginLeft: 16,
  },
  version: {
    textAlign: 'center',
    fontFamily: 'GoogleSansFlex-Regular',
    color: '#555',
    fontSize: 12,
    marginTop: 32,
    marginBottom: 20,
  },
  badgeNew: {
    backgroundColor: '#E50914',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeNewText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex-Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalVersionTag: {
    fontSize: 13,
    color: '#E50914',
    fontFamily: 'GoogleSansFlex-Medium',
    marginBottom: 12,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#A0A0A0',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  modalNotesScroll: {
    maxHeight: 120,
    width: '100%',
    backgroundColor: '#121212',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  modalNotesText: {
    fontSize: 12,
    color: '#CCCCCC',
    lineHeight: 18,
    fontFamily: 'GoogleSansFlex-Regular',
  },
  progressContainer: {
    width: '100%',
    marginBottom: 16,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: '#333333',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#E50914',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'GoogleSansFlex-Medium',
  },
  modalConfirmBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#E50914',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'GoogleSansFlex-Bold',
  },
});

export default Settings;