import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Modern Expo FileSystem import (legacy not needed in SDK 54)
import * as FileSystem from 'expo-file-system'; 
import AsyncStorage from '@react-native-async-storage/async-storage'; 

// Replace Lucide with Expo Vector Icons (Feather is the same style)
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { setGlobalConfig } from '@/src/tmdb'; 

const Settings = () => {
  const insets = useSafeAreaInsets();
  // If you removed @react-navigation/bottom-tabs, use a fixed value or padding
  const tabBarHeight = 60; 

  const [isHiRes, setIsHiRes] = useState(false);
  const [isNsfwFilter, setIsNsfwFilter] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedHiRes = await AsyncStorage.getItem('settings_hires');
      const savedNsfw = await AsyncStorage.getItem('settings_nsfw');
      
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

  const handleClearCache = async () => {
    try {
      Alert.alert(
        "Clear Cache",
        "Are you sure? Images may take longer to load next time.",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Clear", 
            style: "destructive",
            onPress: async () => {
              const cacheDir = FileSystem.cacheDirectory;
              if (cacheDir) {
                // deleteAsync works fine in SDK 54 without /legacy
                await FileSystem.deleteAsync(cacheDir, { idempotent: true });
                await FileSystem.makeDirectoryAsync(cacheDir);
                Alert.alert("Success", "Cache cleared.");
              }
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert("Error", "Failed to clear cache.");
    }
  };

  // Reusable Row Component
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
      >
        <Text style={{ color: 'white', fontSize: 32, fontWeight: 'bold', marginBottom: 20, marginTop: 10 }}>
          Settings
        </Text>

        <View style={{ marginBottom: 20 }}>
          <Text style={{ color: '#888', fontSize: 14, marginBottom: 10, textTransform: 'uppercase' }}>Content</Text>
          
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

        <View style={{ marginBottom: 20 }}>
          <Text style={{ color: '#888', fontSize: 14, marginBottom: 10, textTransform: 'uppercase' }}>Storage</Text>
          
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
      </ScrollView>
    </View>
  );
};

export default Settings;