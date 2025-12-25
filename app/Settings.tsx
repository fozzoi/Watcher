import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Switch, TextInput, Linking, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as FileSystem from 'expo-file-system'; 
import AsyncStorage from '@react-native-async-storage/async-storage'; 

import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { setGlobalConfig } from '../src/tmdb'; 

const Settings = () => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 60; 

  const [isHiRes, setIsHiRes] = useState(false);
  const [isNsfwFilter, setIsNsfwFilter] = useState(true);
  
  // New AI States
  const [isAiEnabled, setIsAiEnabled] = useState(true);
  const [customApiKey, setCustomApiKey] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedHiRes = await AsyncStorage.getItem('settings_hires');
      const savedNsfw = await AsyncStorage.getItem('settings_nsfw');
      const savedAi = await AsyncStorage.getItem('settings_ai_enabled');
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
      // Load AI Settings
      if (savedAi !== null) {
        const val = JSON.parse(savedAi);
        setIsAiEnabled(val);
        setGlobalConfig('aiEnabled', val);
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

  const toggleAi = async (value: boolean) => {
    setIsAiEnabled(value);
    setGlobalConfig('aiEnabled', value);
    await AsyncStorage.setItem('settings_ai_enabled', JSON.stringify(value));
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
            { 
                text: "Get Key Now", 
                onPress: () => Linking.openURL("https://aistudio.google.com/app/apikey")
            }
        ]
    );
  };

  const handleClearCache = async () => {
    Alert.alert(
      "Clear Cache",
      "Are you sure? Images will reload next time.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Clear", 
          style: "destructive",
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

  // Reusable Toggle Component
  const SettingToggleRow = ({ iconFamily: IconFamily, iconName, title, subtitle, value, onValueChange }) => (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: '#1A1A1A', padding: 16, marginBottom: 12, borderRadius: 12,
      borderWidth: 1, borderColor: '#333'
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
        <View style={{ padding: 8, backgroundColor: '#333', borderRadius: 8 }}>
          <IconFamily name={iconName} size={20} color="white" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>{title}</Text>
          {subtitle && <Text style={{ color: '#888', fontSize: 12 }}>{subtitle}</Text>}
        </View>
      </View>
      <Switch
        trackColor={{ false: '#767577', true: '#ef4444' }}
        thumbColor={'#f4f3f4'}
        onValueChange={onValueChange}
        value={value}
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: insets.top }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 50, paddingHorizontal: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: 'white', fontSize: 32, fontWeight: 'bold', marginBottom: 20, marginTop: 10 }}>
          Settings
        </Text>

        {/* --- CONTENT SECTION --- */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: '#888', fontSize: 14, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Content</Text>
          
          <SettingToggleRow 
            iconFamily={Feather} 
            iconName="image" 
            title="Hi-Res Posters" 
            subtitle="Higher quality (uses more data)"
            value={isHiRes} 
            onValueChange={toggleHiRes}
          />

          <SettingToggleRow 
            iconFamily={Feather} 
            iconName="eye-off" 
            title="NSFW Filter" 
            subtitle="Hide explicit/adult content"
            value={isNsfwFilter} 
            onValueChange={toggleNsfw}
          />
        </View>

        {/* --- AI SECTION --- */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: '#888', fontSize: 14, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>AI Features</Text>

          <SettingToggleRow 
            iconFamily={Ionicons} 
            iconName="sparkles-outline" 
            title="Enable AI Vibe Match" 
            subtitle="Get recommendations based on tone"
            value={isAiEnabled} 
            onValueChange={toggleAi}
          />

          {isAiEnabled && (
            <View style={{
                backgroundColor: '#1A1A1A', padding: 16, borderRadius: 12,
                borderWidth: 1, borderColor: '#333'
            }}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8}}>
                    <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>Custom API Key</Text>
                    <TouchableOpacity onPress={handleHowToGetKey}>
                        <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: 'bold' }}>How to get it?</Text>
                    </TouchableOpacity>
                </View>
                
                <Text style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
                    Leave blank to use the default shared key. Use your own key if you hit rate limits frequently.
                </Text>
                
                <TextInput 
                    style={{
                        backgroundColor: '#111', color: 'white', padding: 12, borderRadius: 8,
                        borderWidth: 1, borderColor: '#444', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace'
                    }}
                    placeholder="Paste AIzaSy... here"
                    placeholderTextColor="#555"
                    value={customApiKey}
                    onChangeText={saveApiKey}
                    secureTextEntry={true}
                />
            </View>
          )}
        </View>

        {/* --- STORAGE SECTION --- */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ color: '#888', fontSize: 14, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Storage</Text>
          
          <TouchableOpacity 
            onPress={handleClearCache}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: '#1A1A1A', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#333'
            }}
          >
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

import { Platform } from 'react-native'; // Ensure this is imported

export default Settings;