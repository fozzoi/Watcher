import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Switch, TextInput, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing'; 
import * as DocumentPicker from 'expo-document-picker'; 
import AsyncStorage from '@react-native-async-storage/async-storage'; 

import { Feather, Ionicons } from '@expo/vector-icons';
import { setGlobalConfig } from '../src/tmdb'; 

const Settings = () => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 60; 

  const [isHiRes, setIsHiRes] = useState(false);
  const [isNsfwFilter, setIsNsfwFilter] = useState(true);
  const [isAutoAi, setIsAutoAi] = useState(true);
  const [customApiKey, setCustomApiKey] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedHiRes = await AsyncStorage.getItem('settings_hires');
      const savedNsfw = await AsyncStorage.getItem('settings_nsfw');
      const savedAutoAi = await AsyncStorage.getItem('settings_auto_ai');
      const savedKey = await AsyncStorage.getItem('settings_custom_key');
      
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
      if (savedKey !== null) {
        setCustomApiKey(savedKey);
        setGlobalConfig('customApiKey', savedKey);
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

  const saveApiKey = async (text: string) => {
    setCustomApiKey(text);
    setGlobalConfig('customApiKey', text);
    await AsyncStorage.setItem('settings_custom_key', text);
  };

  const handleHowToGetKey = () => {
    Alert.alert(
        "How to get a Gemini API Key",
        "1. Go to Google AI Studio.\n2. Sign in with Google.\n3. Click 'Create API Key'.\n4. Copy the key and paste it here.\n\nIt is free for personal use.",
        [
            { text: "Cancel", style: "cancel" },
            { text: "Get Key Now", onPress: () => Linking.openURL("https://aistudio.google.com/app/apikey") }
        ]
    );
  };

  // 🎯 EXPORT LOGIC (Expo FileSystem + Sharing)
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
        fileContent = JSON.stringify({ 
            watchlist: rawWatchlist, 
            artists: rawArtists, 
            history: rawHistory 
        }, null, 2);
      } else {
        fileContent += "movies\n";
        rawWatchlist.forEach((i: any, index: number) => {
          const year = i.release_date || i.first_air_date ? String(i.release_date || i.first_air_date).substring(0, 4) : '';
          const yearText = year ? ` ${year}` : '';
          fileContent += `${index + 1} ${i.title || i.name}${yearText}\n`;
        });

        fileContent += "\nartist\n";
        rawArtists.forEach((i: any, index: number) => {
          fileContent += `${index + 1} ${i.name}\n`;
        });

        fileContent += "\nwatched\n";
        rawHistory.forEach((i: any, index: number) => {
          const year = i.release_date || i.first_air_date ? String(i.release_date || i.first_air_date).substring(0, 4) : '';
          const yearText = year ? ` ${year}` : '';
          fileContent += `${index + 1} ${i.title || i.name}${yearText}\n`;
        });
      }

      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, fileContent, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
            mimeType: format === 'json' ? 'application/json' : 'text/plain',
            dialogTitle: 'Export Watcher Data'
        });
      } else {
        Alert.alert("Error", "Sharing is not available on this device.");
      }
    } catch (error) {
      Alert.alert("Export Failed", "There was an error generating your backup file.");
    }
  };

  // 🎯 RESTORE LOGIC (Expo DocumentPicker + Fetch Text Method)
  const handleRestoreBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', '*/*'],
        copyToCacheDirectory: true
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const fileUri = result.assets[0].uri;
      
      // Using the exact fetch method from your Watchlist page
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
      console.error(error);
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

  const SettingToggleRow = ({ iconFamily: IconFamily, iconName, title, subtitle, value, onValueChange }: any) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1A1A1A', padding: 16, marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: '#333' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
        <View style={{ padding: 8, backgroundColor: '#333', borderRadius: 8 }}>
          <IconFamily name={iconName} size={20} color="white" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>{title}</Text>
          {subtitle && <Text style={{ color: '#888', fontSize: 12 }}>{subtitle}</Text>}
        </View>
      </View>
      <Switch trackColor={{ false: '#767577', true: '#ef4444' }} thumbColor={'#f4f3f4'} onValueChange={onValueChange} value={value} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: tabBarHeight + 50, paddingHorizontal: 16 }} keyboardShouldPersistTaps="handled">
        
        <Text style={{ color: 'white', fontSize: 32, fontWeight: 'bold', marginBottom: 20, marginTop: 10 }}>Settings</Text>

        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: '#888', fontSize: 14, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Content</Text>
          <SettingToggleRow iconFamily={Feather} iconName="image" title="Hi-Res Posters" subtitle="Higher quality (uses more data)" value={isHiRes} onValueChange={toggleHiRes} />
          <SettingToggleRow iconFamily={Feather} iconName="eye-off" title="NSFW Filter" subtitle="Hide explicit/adult content" value={isNsfwFilter} onValueChange={toggleNsfw} />
        </View>

        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: '#888', fontSize: 14, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>AI Features</Text>
          <SettingToggleRow iconFamily={Ionicons} iconName="sparkles-outline" title="Auto AI Vibe Match" subtitle="Auto-fetch AI recommendations on details page" value={isAutoAi} onValueChange={toggleAutoAi} />
          <View style={{ backgroundColor: '#1A1A1A', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#333' }}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8}}>
                  <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>Custom API Key</Text>
                  <TouchableOpacity onPress={handleHowToGetKey}>
                      <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: 'bold' }}>How to get it?</Text>
                  </TouchableOpacity>
              </View>
              <Text style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>Leave blank to use the default shared key. Use your own key to completely avoid rate limits.</Text>
              <TextInput style={{ backgroundColor: '#111', color: 'white', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#444', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }} placeholder="Paste AIzaSy... here" placeholderTextColor="#555" value={customApiKey} onChangeText={saveApiKey} secureTextEntry={true} />
          </View>
        </View>

        <View style={{ marginBottom: 20 }}>
          <Text style={{ color: '#888', fontSize: 14, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Data & Storage</Text>
          
          <TouchableOpacity onPress={handleExportPrompt} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1A1A1A', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#333', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ padding: 8, backgroundColor: 'rgba(59, 130, 246, 0.2)', borderRadius: 8 }}>
                <Feather name="upload" size={20} color="#3B82F6" />
              </View>
              <View>
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>Export Library Backup</Text>
                <Text style={{ color: '#888', fontSize: 12 }}>Save Watchlist & History to phone</Text>
              </View>
            </View>
            <Feather name="chevron-right" color="#666" size={20} />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleRestoreBackup} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1A1A1A', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#333', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ padding: 8, backgroundColor: 'rgba(34, 197, 94, 0.2)', borderRadius: 8 }}>
                <Feather name="download" size={20} color="#22C55E" />
              </View>
              <View>
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>Restore Library Backup</Text>
                <Text style={{ color: '#888', fontSize: 12 }}>Import from a .json file</Text>
              </View>
            </View>
            <Feather name="chevron-right" color="#666" size={20} />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleClearCache} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1A1A1A', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#333' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ padding: 8, backgroundColor: 'rgba(239, 68, 68, 0.2)', borderRadius: 8 }}>
                <Feather name="trash-2" size={20} color="#EF4444" />
              </View>
              <View>
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>Clear Cache</Text>
                <Text style={{ color: '#888', fontSize: 12 }}>Free up local space</Text>
              </View>
            </View>
            <Feather name="chevron-right" color="#666" size={20} />
          </TouchableOpacity>
        </View>
        
        <View style={{alignItems: 'center', marginTop: 20}}>
            <Text style={{color: '#444', fontSize: 12}}>Version 1.0.0 • React Native</Text>
        </View>
      </ScrollView>
    </View>
  );
};

export default Settings;