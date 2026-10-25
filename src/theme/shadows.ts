import { StyleSheet, ViewStyle } from 'react-native';

export interface ShadowPreset {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

/**
 * Standardized, uniform shadow tokens across Watcher.
 * Provides clean, cross-platform elevation on both iOS and Android.
 */
export const shadows: Record<'sm' | 'md' | 'lg' | 'xl', ShadowPreset> = {
  // Level 1: Subtle chips, tabs, small pill badges
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },

  // Level 2: Standard cards, movie posters, search bars, grid items
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 4,
  },

  // Level 3: Spotlight carousel, floating action buttons, elevated cards
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.20,
    shadowRadius: 10,
    elevation: 6,
  },

  // Level 4: Modals, dialogs, bottom sheets, navigation dock
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 10,
  },
};

/**
 * Returns a subtle primary colored glow shadow for active/selected elements.
 */
export const getActiveGlowShadow = (primaryColor: string): ShadowPreset => ({
  shadowColor: primaryColor,
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.35,
  shadowRadius: 8,
  elevation: 4,
});
