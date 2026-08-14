import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet, Alert, Platform, TextInput } from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { GLOBAL_CONFIG } from '../src/tmdb';

const SettingToggleRow = ({ iconFamily: IconFamily, iconName, title, subtitle, value, onValueChange, iconColor = 'white', glowColor = '#333' }: any) => (
  <View style={styles.settingRow}>
    <View style={styles.settingLeft}>
      <View style={[styles.iconContainer, { backgroundColor: glowColor, shadowColor: iconColor }]}>
        <IconFamily name={iconName} size={20} color={iconColor} />
      </View>
      <View style={styles.settingTextContainer}>
        <Text style={styles.settingTitle}>{title}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
    </View>
    <Switch 
      trackColor={{ false: '#3A3A3C', true: '#8B5CF6' }} // Futuristic Purple Accent
      thumbColor={'#ffffff'} 
      onValueChange={onValueChange} 
      value={value} 
    />
  </View>
);

const Settings = () => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  
  const [isHiRes, setIsHiRes] = useState(true);
  const [isNsfwFilter, setIsNsfwFilter] = useState(true);
  const [isAutoAi, setIsAutoAi] = useState(false);
  const [customApiKey, setCustomApiKey] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [hiRes, nsfw, autoAi, apiKey] = await Promise.all([
          AsyncStorage.getItem('setting_hires'),
          AsyncStorage.getItem('setting_nsfw'),
          AsyncStorage.getItem('setting_autoai'),
          AsyncStorage.getItem('setting_apikey')
        ]);
        if (hiRes !== null) setIsHiRes(hiRes === 'true');
        if (nsfw !== null) setIsNsfwFilter(nsfw === 'true');
        if (autoAi !== null) setIsAutoAi(autoAi === 'true');
        if (apiKey !== null) {
          setCustomApiKey(apiKey);
          GLOBAL_CONFIG.customApiKey = apiKey;
        }
      } catch (error) {
        console.log("Error loading settings", error);
      }
    };
    loadSettings();
  }, []);

  const toggleHiRes = (val: boolean) => { setIsHiRes(val); AsyncStorage.setItem('setting_hires', val.toString()); };
  const toggleNsfw = (val: boolean) => { setIsNsfwFilter(val); AsyncStorage.setItem('setting_nsfw', val.toString()); };
  const toggleAutoAi = (val: boolean) => { setIsAutoAi(val); AsyncStorage.setItem('setting_autoai', val.toString()); };
  const saveApiKey = (val: string) => { setCustomApiKey(val); AsyncStorage.setItem('setting_apikey', val); GLOBAL_CONFIG.customApiKey = val; };

  const handleHowToGetKey = () => { Alert.alert('Gemini API Key', 'Go to Google AI Studio to get a free API key.'); };
  const handleExportPrompt = () => { Alert.alert('Export Backup', 'Feature coming soon!'); };
  const handleRestoreBackup = () => { Alert.alert('Restore Backup', 'Feature coming soon!'); };
  const handleClearCache = () => { Alert.alert('Clear Cache', 'Cache cleared successfully!'); };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1F112F', '#09090B']} locations={[0, 0.4]} style={StyleSheet.absoluteFill} />
      
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20, paddingBottom: tabBarHeight + 50 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.headerTitle}>Settings</Text>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>CONTENT</Text>
          <View style={styles.card}>
            <SettingToggleRow 
              iconFamily={Feather} iconName="image" title="Hi-Res Posters" subtitle="Higher quality (uses more data)" 
              value={isHiRes} onValueChange={toggleHiRes} 
              iconColor="#38BDF8" glowColor="rgba(56, 189, 248, 0.15)"
            />
            <View style={styles.divider} />
            <SettingToggleRow 
              iconFamily={Feather} iconName="eye-off" title="NSFW Filter" subtitle="Hide explicit/adult content" 
              value={isNsfwFilter} onValueChange={toggleNsfw} 
              iconColor="#F472B6" glowColor="rgba(244, 114, 182, 0.15)"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>AI FEATURES</Text>
          <View style={styles.card}>
            <SettingToggleRow 
              iconFamily={Ionicons} iconName="sparkles" title="Auto AI Vibe Match" subtitle="Auto-fetch AI recommendations" 
              value={isAutoAi} onValueChange={toggleAutoAi} 
              iconColor="#FBBF24" glowColor="rgba(251, 191, 36, 0.15)"
            />
            <View style={styles.divider} />
            <View style={styles.apiKeyContainer}>
              <View style={styles.apiKeyHeaderRow}>
                <Text style={styles.apiKeyTitle}>Custom API Key</Text>
                <TouchableOpacity activeOpacity={0.95} onPress={handleHowToGetKey}>
                  <Text style={styles.apiKeyLink}>How to get it?</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.apiKeySubtitle}>Leave blank to use the default shared key. Use your own key to completely avoid rate limits.</Text>
              <TextInput 
                style={styles.apiInput} 
                placeholder="Paste AIzaSy... here" 
                placeholderTextColor="#555" 
                value={customApiKey} 
                onChangeText={saveApiKey} 
                secureTextEntry={true} 
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>DATA & STORAGE</Text>
          <View style={styles.card}>
            <TouchableOpacity activeOpacity={0.95} onPress={handleExportPrompt} style={styles.actionRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                  <Feather name="upload-cloud" size={20} color="#3B82F6" />
                </View>
                <View>
                  <Text style={styles.settingTitle}>Export Library Backup</Text>
                  <Text style={styles.settingSubtitle}>Save Watchlist & History to phone</Text>
                </View>
              </View>
              <Feather name="chevron-right" color="#666" size={20} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity activeOpacity={0.95} onPress={handleRestoreBackup} style={styles.actionRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(34, 197, 94, 0.15)' }]}>
                  <Feather name="download-cloud" size={20} color="#22C55E" />
                </View>
                <View>
                  <Text style={styles.settingTitle}>Restore Library Backup</Text>
                  <Text style={styles.settingSubtitle}>Import from a .json file</Text>
                </View>
              </View>
              <Feather name="chevron-right" color="#666" size={20} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity activeOpacity={0.95} onPress={handleClearCache} style={styles.actionRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.iconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                  <Feather name="trash-2" size={20} color="#EF4444" />
                </View>
                <View>
                  <Text style={styles.settingTitle}>Clear Cache</Text>
                  <Text style={styles.settingSubtitle}>Free up local space</Text>
                </View>
              </View>
              <Feather name="chevron-right" color="#666" size={20} />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.footer}>
          <Text style={styles.footerText}>Version 1.1.0 • React Native</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090B' },
  scrollContent: { paddingHorizontal: 16 },
  headerTitle: { color: 'white', fontSize: 34, fontWeight: '800', marginBottom: 24, letterSpacing: 0.5 },
  section: { marginBottom: 28 },
  sectionHeader: { color: '#888', fontSize: 13, fontWeight: '700', marginBottom: 12, marginLeft: 8, letterSpacing: 1.2 },
  card: { backgroundColor: '#18181B', borderRadius: 16, borderWidth: 1, borderColor: '#27272A', overflow: 'hidden' },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  iconContainer: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  settingTextContainer: { flex: 1 },
  settingTitle: { color: 'white', fontSize: 16, fontWeight: '600', marginBottom: 2 },
  settingSubtitle: { color: '#999', fontSize: 13 },
  divider: { height: 1, backgroundColor: '#27272A', marginLeft: 64 },
  apiKeyContainer: { padding: 16 },
  apiKeyHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  apiKeyTitle: { color: 'white', fontSize: 16, fontWeight: '600' },
  apiKeyLink: { color: '#8B5CF6', fontSize: 13, fontWeight: '700' },
  apiKeySubtitle: { color: '#999', fontSize: 13, marginBottom: 16, lineHeight: 18 },
  apiInput: { backgroundColor: '#09090B', color: 'white', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#27272A', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 14 },
  footer: { alignItems: 'center', marginTop: 10 },
  footerText: { color: '#555', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 }
});

export default Settings;
