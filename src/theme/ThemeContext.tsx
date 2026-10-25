import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  resolveThemeColors,
  darkColors,
  lightColors,
  ThemeColors,
  ACCENT_COLOR,
  palette,
} from './colors';

export type ThemeMode = 'dark' | 'light' | 'system';

export interface ThemeContextType {
  themeMode: ThemeMode;
  isDark: boolean;
  useMaterialYou: boolean;
  ambientTheming: boolean;
  colors: ThemeColors;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
  setUseMaterialYou: (enabled: boolean) => Promise<void>;
  toggleMaterialYou: () => Promise<void>;
  setAmbientTheming: (enabled: boolean) => Promise<void>;
  toggleAmbientTheming: () => Promise<void>;
}

const THEME_STORAGE_KEY = 'app_user_theme_mode';
const MATERIAL_YOU_STORAGE_KEY = 'app_user_material_you';
const AMBIENT_THEME_STORAGE_KEY = 'app_user_ambient_theme';

// Module-level cached colors for synchronous non-component access
let currentActiveColors: ThemeColors = darkColors;
let currentIsDark: boolean = true;
let currentUseMaterialYou: boolean = false;
let currentAmbientTheming: boolean = true;

export const getActiveThemeColors = (): ThemeColors => currentActiveColors;
export const getActiveIsDark = (): boolean => currentIsDark;
export const getActiveUseMaterialYou = (): boolean => currentUseMaterialYou;
export const getActiveAmbientTheming = (): boolean => currentAmbientTheming;

const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'dark',
  isDark: true,
  useMaterialYou: false,
  ambientTheming: true,
  colors: darkColors,
  setThemeMode: async () => {},
  toggleTheme: async () => {},
  setUseMaterialYou: async () => {},
  toggleMaterialYou: async () => {},
  setAmbientTheming: async () => {},
  toggleAmbientTheming: async () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useDeviceColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [useMaterialYou, setUseMaterialYouState] = useState<boolean>(false);
  const [ambientTheming, setAmbientThemingState] = useState<boolean>(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [savedMode, savedMat, savedAmbient] = await Promise.all([
          AsyncStorage.getItem(THEME_STORAGE_KEY),
          AsyncStorage.getItem(MATERIAL_YOU_STORAGE_KEY),
          AsyncStorage.getItem(AMBIENT_THEME_STORAGE_KEY),
        ]);
        if (savedMode === 'dark' || savedMode === 'light' || savedMode === 'system') {
          setThemeModeState(savedMode as ThemeMode);
        }
        if (savedMat !== null) {
          setUseMaterialYouState(savedMat === 'true');
        }
        if (savedAmbient !== null) {
          setAmbientThemingState(savedAmbient === 'true');
        }
      } catch {}
      setIsLoaded(true);
    })();
  }, []);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {}
  };

  const isDark = themeMode === 'system' ? systemScheme !== 'light' : themeMode === 'dark';

  const toggleTheme = async () => {
    const nextMode = isDark ? 'light' : 'dark';
    await setThemeMode(nextMode);
  };

  const setUseMaterialYou = async (enabled: boolean) => {
    setUseMaterialYouState(enabled);
    try {
      await AsyncStorage.setItem(MATERIAL_YOU_STORAGE_KEY, String(enabled));
    } catch {}
  };

  const toggleMaterialYou = async () => {
    await setUseMaterialYou(!useMaterialYou);
  };

  const setAmbientTheming = async (enabled: boolean) => {
    setAmbientThemingState(enabled);
    currentAmbientTheming = enabled;
    try {
      await AsyncStorage.setItem(AMBIENT_THEME_STORAGE_KEY, String(enabled));
    } catch {}
  };

  const toggleAmbientTheming = async () => {
    await setAmbientTheming(!ambientTheming);
  };

  const colors = useMemo(() => {
    const res = resolveThemeColors(isDark ? 'dark' : 'light', useMaterialYou);
    currentActiveColors = res;
    currentIsDark = isDark;
    currentUseMaterialYou = useMaterialYou;
    currentAmbientTheming = ambientTheming;
    return res;
  }, [isDark, useMaterialYou, ambientTheming]);

  const value = useMemo(
    () => ({
      themeMode,
      isDark,
      useMaterialYou,
      ambientTheming,
      colors,
      setThemeMode,
      toggleTheme,
      setUseMaterialYou,
      toggleMaterialYou,
      setAmbientTheming,
      toggleAmbientTheming,
    }),
    [themeMode, isDark, useMaterialYou, ambientTheming, colors]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useAppTheme = () => useContext(ThemeContext);
