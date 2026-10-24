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
  colors: ThemeColors;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
  setUseMaterialYou: (enabled: boolean) => Promise<void>;
  toggleMaterialYou: () => Promise<void>;
}

const THEME_STORAGE_KEY = 'app_user_theme_mode';
const MATERIAL_YOU_STORAGE_KEY = 'app_user_material_you';

// Module-level cached colors for synchronous non-component access
let currentActiveColors: ThemeColors = darkColors;
let currentIsDark: boolean = true;
let currentUseMaterialYou: boolean = false;

export const getActiveThemeColors = (): ThemeColors => currentActiveColors;
export const getActiveIsDark = (): boolean => currentIsDark;
export const getActiveUseMaterialYou = (): boolean => currentUseMaterialYou;

const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'dark',
  isDark: true,
  useMaterialYou: false,
  colors: darkColors,
  setThemeMode: async () => {},
  toggleTheme: async () => {},
  setUseMaterialYou: async () => {},
  toggleMaterialYou: async () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useDeviceColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [useMaterialYou, setUseMaterialYouState] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [savedMode, savedMat] = await Promise.all([
          AsyncStorage.getItem(THEME_STORAGE_KEY),
          AsyncStorage.getItem(MATERIAL_YOU_STORAGE_KEY),
        ]);
        if (savedMode === 'dark' || savedMode === 'light' || savedMode === 'system') {
          setThemeModeState(savedMode as ThemeMode);
        }
        if (savedMat !== null) {
          setUseMaterialYouState(savedMat === 'true');
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

  const colors = useMemo(() => {
    const res = resolveThemeColors(isDark ? 'dark' : 'light', useMaterialYou);
    currentActiveColors = res;
    currentIsDark = isDark;
    currentUseMaterialYou = useMaterialYou;
    return res;
  }, [isDark, useMaterialYou]);

  const value = useMemo(
    () => ({
      themeMode,
      isDark,
      useMaterialYou,
      colors,
      setThemeMode,
      toggleTheme,
      setUseMaterialYou,
      toggleMaterialYou,
    }),
    [themeMode, isDark, useMaterialYou, colors]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useAppTheme = () => useContext(ThemeContext);
