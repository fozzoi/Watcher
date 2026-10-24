import { Platform } from 'react-native';

/**
 * ============================================================================
 * GLOBAL COLOR CONFIGURATION & ACCENTS
 * Declare your brand accent and color tokens here in one single place.
 * Changing ACCENT_COLOR will update the accent across the entire app!
 * ============================================================================
 */
export const ACCENT_COLOR = '#E50914'; // App-wide primary brand accent (change here!)

export const palette = {
  accent: ACCENT_COLOR,
  accentHover: '#B80710',
  purple: '#8E24AA',
  purpleLight: '#C084FC',
  green: '#30D158',
  yellow: '#FFD60A',
  red: '#FF453A',
  blue: '#0A84FF',
  gray900: '#0B0B0E',
  gray800: '#161618',
  gray700: '#1C1C1E',
  gray600: '#2C2C2E',
  gray500: '#3A3A3C',
  gray400: '#8E8E93',
  gray300: '#AEAEB2',
  gray200: '#E5E5EA',
  gray100: '#F2F2F7',
  white: '#FFFFFF',
  black: '#000000',
};

export interface ThemeColors {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  inversePrimary: string;

  background: string;
  surface: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerLow: string;
  surfaceVariant: string;
  inverseSurface: string;
  inverseOnSurface: string;
  card: string;

  text: string;
  textSecondary: string;
  textMuted: string;
  onSurface: string;
  onSurfaceVariant: string;

  border: string;
  outline: string;
  outlineVariant: string;
  divider: string;

  success: string;
  warning: string;
  error: string;
  onError: string;

  overlay: string;
  dockBackground: string;
  badgeBg: string;
}

export const darkColors: ThemeColors = {
  primary: ACCENT_COLOR,
  onPrimary: '#FFFFFF',
  primaryContainer: 'rgba(229, 9, 20, 0.18)',
  onPrimaryContainer: '#FFB4AB',
  inversePrimary: '#8C1D18',

  background: '#0B0B0E',
  surface: '#121214',
  surfaceContainer: '#1C1C1E',
  surfaceContainerHigh: '#242428',
  surfaceContainerLow: '#18181A',
  surfaceVariant: '#2C2C30',
  inverseSurface: '#E6E1E5',
  inverseOnSurface: '#313033',
  card: '#161618',

  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  textMuted: '#636366',
  onSurface: '#E6E1E5',
  onSurfaceVariant: '#CAC4D0',

  border: '#2C2C2E',
  outline: '#3A3A3C',
  outlineVariant: '#242426',
  divider: 'rgba(255, 255, 255, 0.08)',

  success: '#30D158',
  warning: '#FFD60A',
  error: '#FF453A',
  onError: '#FFFFFF',

  overlay: 'rgba(0, 0, 0, 0.75)',
  dockBackground: 'rgba(20, 20, 22, 0.88)',
  badgeBg: 'rgba(229, 9, 20, 0.18)',
};

export const lightColors: ThemeColors = {
  primary: ACCENT_COLOR,
  onPrimary: '#FFFFFF',
  primaryContainer: 'rgba(229, 9, 20, 0.12)',
  onPrimaryContainer: '#410002',
  inversePrimary: '#FFB4AB',

  background: '#F8F9FA',
  surface: '#FFFFFF',
  surfaceContainer: '#FFFFFF',
  surfaceContainerHigh: '#F1F3F5',
  surfaceContainerLow: '#F8F9FA',
  surfaceVariant: '#E9ECEF',
  inverseSurface: '#313033',
  inverseOnSurface: '#F4EFF4',
  card: '#FFFFFF',

  text: '#111827',
  textSecondary: '#4B5563',
  textMuted: '#9CA3AF',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',

  border: '#E5E7EB',
  outline: '#D1D5DB',
  outlineVariant: '#E5E7EB',
  divider: 'rgba(0, 0, 0, 0.08)',

  success: '#16A34A',
  warning: '#D97706',
  error: '#DC2626',
  onError: '#FFFFFF',

  overlay: 'rgba(0, 0, 0, 0.45)',
  dockBackground: 'rgba(255, 255, 255, 0.90)',
  badgeBg: 'rgba(229, 9, 20, 0.12)',
};

/**
 * Normalizes 8-digit RGBA hex (#RRGGBBAA) returned by native MaterialColors
 * into standard 6-digit #RRGGBB when alpha is FF.
 */
function normalizeHex(color?: string): string | undefined {
  if (!color) return undefined;
  if (color.startsWith('#') && color.length === 9 && color.toUpperCase().endsWith('FF')) {
    return color.substring(0, 7);
  }
  return color;
}

/**
 * Resolves colors, seamlessly blending Material You system dynamic colors
 * on Android 12+ while maintaining clean theme fallbacks across iOS and Web.
 * 
 * - If dynamic is true (Material You enabled):
 *     Extracts the wallpaper dynamic primary, surface, background, and accent colors.
 * - If dynamic is false:
 *     Preserves the iconic Watcher Red (ACCENT_COLOR = #E50914) with dark / light themes!
 */
export function resolveThemeColors(mode: 'dark' | 'light', dynamic = false): ThemeColors {
  const base = mode === 'dark' ? { ...darkColors } : { ...lightColors };

  if (Platform.OS === 'android' && dynamic) {
    try {
      const { getMaterialColors } = require('@expo/ui/jetpack-compose');
      const mat = getMaterialColors({ scheme: mode });
      if (mat) {
        const primary = normalizeHex(mat.primary) || base.primary;
        const background = normalizeHex(mat.background) || base.background;
        const surface = normalizeHex(mat.surface) || base.surface;
        const surfaceContainer = normalizeHex(mat.surfaceContainer) || base.surfaceContainer;
        const surfaceContainerHigh = normalizeHex(mat.surfaceContainerHigh) || base.surfaceContainerHigh;
        const surfaceContainerLow = normalizeHex(mat.surfaceContainerLow) || base.surfaceContainerLow;
        const surfaceVariant = normalizeHex(mat.surfaceVariant) || base.surfaceVariant;
        const onSurface = normalizeHex(mat.onSurface) || base.onSurface;
        const onSurfaceVariant = normalizeHex(mat.onSurfaceVariant) || base.onSurfaceVariant;
        const onPrimary = normalizeHex(mat.onPrimary) || base.onPrimary;
        const primaryContainer = normalizeHex(mat.primaryContainer) || base.primaryContainer;
        const onPrimaryContainer = normalizeHex(mat.onPrimaryContainer) || base.onPrimaryContainer;
        const inversePrimary = normalizeHex(mat.inversePrimary) || base.inversePrimary;
        const inverseSurface = normalizeHex(mat.inverseSurface) || base.inverseSurface;
        const inverseOnSurface = normalizeHex(mat.inverseOnSurface) || base.inverseOnSurface;
        const outline = normalizeHex(mat.outline) || base.outline;
        const outlineVariant = normalizeHex(mat.outlineVariant) || base.outlineVariant;

        return {
          ...base,
          primary,
          onPrimary,
          primaryContainer,
          onPrimaryContainer,
          inversePrimary,

          background,
          surface,
          surfaceContainer,
          surfaceContainerHigh,
          surfaceContainerLow,
          surfaceVariant,
          inverseSurface,
          inverseOnSurface,
          card: surfaceContainer,

          text: onSurface,
          textSecondary: onSurfaceVariant,
          onSurface,
          onSurfaceVariant,

          border: outlineVariant,
          outline,
          outlineVariant,
          divider: mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',

          badgeBg: primaryContainer,
          dockBackground: mode === 'dark' ? 'rgba(20, 20, 22, 0.88)' : 'rgba(255, 255, 255, 0.90)',
        };
      }
    } catch {
      // Use clean standard theme tokens
    }
  }

  return base;
}
