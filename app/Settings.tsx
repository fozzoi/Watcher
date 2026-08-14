import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Switch, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing'; 
import * as DocumentPicker from 'expo-document-picker'; 
import AsyncStorage from '@react-native-async-storage/async-storage'; 

import { Feather } from '@expo/vector-icons';
import { setGlobalConfig } from '../src/tmdb';
import Constants from 'expo-constants';

const Settings = () => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 60; 

  const [isHiRes, setIsHiRes] = useState(false);
  const [isNsfwFilter, setIsNsfwFilter] = useState(true);
  const [isAutoAi, setIsAutoAi] = useState(true);
  
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedHiRes = await AsyncStorage.getItem('settings_hires');
      const savedNsfw = await AsyncStorage.getItem('settings_nsfw');
      const savedAutoAi = await AsyncStorage.getItem('settings_auto_ai');
      
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
      if (savedAutoAi !== null) {
        setIsAutoAi(JSON.parse(savedAutoAi));
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

  const toggleAutoAi = async (value: boolean) => {
    setIsAutoAi(value);
    await AsyncStorage.setItem('settings_auto_ai', JSON.stringify(value));
  };

  // EXPORT LOGIC
  const handleExportPrompt = () => {
    Alert.alert(
      "Export Library",
      "Choose a format to export your Watchlist, Artists, and Watched History.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Export as .TXT", onPress: () => performExport('txt') },
        { text: "Export as .JSON", onPress: () => performExport('json') }
      ]
    );
  };

  const performExport = async (format: 'txt' | 'json') => {
    try {
      const mStr = await AsyncStorage.getItem('watchlist');
      const aStr = await AsyncStorage.getItem('favoriteArtists');
      const hStr = await AsyncStorage.getItem('history');

      const rawWatchlist = mStr ? JSON.parse(mStr) : [];
      const rawArtists = aStr ? JSON.parse(aStr) : [];
      const rawHistory = hStr ? JSON.parse(hStr) : [];

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
        Alert.alert("Error", "Sharing is not available on this device.");
      }
    } catch (error) {
      Alert.alert("Export Failed", "There was an error generating your backup file.");
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
        await AsyncStorage.setItem('watchlist', JSON.stringify(backupData.watchlist));
        restoredTotal += backupData.watchlist.length;
      }
      if (backupData.artists && Array.isArray(backupData.artists)) {
        await AsyncStorage.setItem('favoriteArtists', JSON.stringify(backupData.artists));
        restoredTotal += backupData.artists.length;
      }
      if (backupData.history && Array.isArray(backupData.history)) {
        await AsyncStorage.setItem('history', JSON.stringify(backupData.history));
        restoredTotal += backupData.history.length;
      }

      if (restoredTotal > 0) {
        Alert.alert("Backup Restored! 🎉", `Successfully restored ${restoredTotal} items.\n\nGo back to your Library to see them.`);
      } else {
        Alert.alert("Invalid File", "This JSON file does not contain valid Watcher backup data.");
      }
    } catch (error) {
      Alert.alert("Restore Failed", "Make sure you selected a valid Watcher Backup .json file.");
    }
  };

  const handleClearCache = async () => {
    Alert.alert(
      "Clear Cache",
      "Are you sure? Images will reload next time.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Clear", style: "destructive",
          onPress: async () => {
            const cacheDir = FileSystem.cacheDirectory;
            if (cacheDir) {
              await FileSystem.deleteAsync(cacheDir, { idempotent: true });
              await FileSystem.makeDirectoryAsync(cacheDir);
              Alert.alert("Success", "Cache cleared.");
            }
          }
        }
      ]
    );
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
        </View>

        {/* ── AI ── */}
        <Text style={styles.sectionLabel}>AI</Text>
        <View style={styles.card}>
          <ToggleRow 
            title="Auto AI Vibe Match" 
            subtitle="Fetch AI recommendations on detail pages" 
            value={isAutoAi} 
            onValueChange={toggleAutoAi} 
          />
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
});

export default Settings;