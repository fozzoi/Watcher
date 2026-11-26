// src/components/explore/ExploreAmbientMeshBackdrop.tsx
import React, { memo, useMemo, useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  StatusBar,
  useWindowDimensions,
  Platform,
  AppState,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useSelector } from '@legendapp/state/react';
import { useAppTheme } from '../../theme';
import { useImagePalette, hexToHsl, hslToHex } from '../../utils/colorExtractor';
import { getImageUrl } from '../../tmdb';
import { heroCarousel$, heroActiveItem$, heroScroll$ } from './HeroSection';
import { HERO_HEIGHT } from './ExploreConstants';
import Aurora from '../shared/Aurora';

export interface HarmonicMeshShades {
  dominant: string;
  luminous: string;
  radiant: string;
  deep: string;
}

/**
 * Derives harmonic tonal shades from the film's authentic palette.
 * Preserves the exact hue (h) and natural chromatic depth without forcing artificial
 * fluorescent saturation or hue distortions.
 */
export function deriveHarmonicShades(baseHex: string, isDark: boolean): HarmonicMeshShades {
  const [h, s, l] = hexToHsl(baseHex);

  if (s < 0.08) {
    return {
      dominant: isDark ? '#334155' : '#64748B',
      luminous: isDark ? '#475569' : '#94A3B8',
      radiant: isDark ? '#1E293B' : '#475569',
      deep: isDark ? '#0B0F19' : '#E2E8F0',
    };
  }

  const sat = Math.max(0.35, Math.min(0.85, s * 1.15));
  const baseLight = isDark ? Math.max(0.34, Math.min(0.52, l)) : Math.max(0.50, Math.min(0.68, l));

  return {
    dominant: hslToHex(h, sat, baseLight),
    luminous: hslToHex(h, Math.min(0.90, sat * 1.05), Math.min(0.65, baseLight + 0.12)),
    deep: hslToHex(h, Math.max(0.28, sat * 0.85), isDark ? 0.16 : 0.82),
    radiant: hslToHex(h, Math.min(0.92, sat * 1.2), Math.max(0.34, baseLight - 0.04)),
  };
}

export interface ExploreAmbientMeshBackdropProps {
  items?: any[];
  initialItem?: any;
  scrollY?: SharedValue<number>;
  isSearchExpanded?: boolean;
}

export const ExploreAmbientMeshBackdrop = memo(function ExploreAmbientMeshBackdrop({
  items,
  initialItem,
  scrollY,
  isSearchExpanded = false,
}: ExploreAmbientMeshBackdropProps) {
  const { colors, isDark, ambientTheming } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();

  const isScrolledOut = useSelector(() => heroScroll$.isScrolledOut.get());
  const [isFocused, setIsFocused] = useState(true);
  const [isForeground, setIsForeground] = useState(AppState.currentState === 'active');

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setIsForeground(state === 'active');
    });
    return () => sub.remove();
  }, []);

  const heroCarouselState = useSelector(() => heroCarousel$.get());
  const heroItem = useSelector(() => heroActiveItem$.item.get());

  const activeItem =
    heroCarouselState?.items?.[heroCarouselState?.activeIndex ?? 0] ||
    heroItem ||
    (items && items.length > 0 ? items[0] : initialItem);

  const imagePath = activeItem?.poster_path || activeItem?.backdrop_path || null;
  const thumbUrl = useMemo(() => (imagePath ? getImageUrl(imagePath, 'w92') : null), [imagePath]);

  const { palette } = useImagePalette(thumbUrl);

  const shades = useMemo(() => {
    const baseColor = palette?.rawDominant || palette?.dominant || (isDark ? '#2D3748' : '#CBD5E1');
    return deriveHarmonicShades(baseColor, isDark);
  }, [palette?.rawDominant, palette?.dominant, isDark]);

  // Color stops for the GPU Aurora curtain:
  // Blends the authentic film tones (deep shadow -> radiant core -> dominant tint -> luminous highlight)
  const auroraColorStops = useMemo(() => {
    return [
      shades.deep,
      shades.radiant,
      shades.dominant,
      shades.luminous,
      shades.deep,
    ];
  }, [shades]);

  const topInset = StatusBar.currentHeight || (Platform.OS === 'ios' ? 44 : 28);
  const totalBackdropHeight = Math.round(HERO_HEIGHT + topInset);

  // Synchronized scroll: scrolls naturally with page content on UI thread
  const animatedScrollStyle = useAnimatedStyle(() => {
    const y = scrollY ? scrollY.value : 0;
    return {
      transform: [{ translateY: -y }],
    };
  });

  if (ambientTheming === false) {
    return null;
  }

  const shouldPause = !isFocused || !isForeground || isScrolledOut || isSearchExpanded;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.rootContainer,
        {
          width: screenWidth,
          height: totalBackdropHeight,
        },
        animatedScrollStyle,
      ]}
    >
      {/* Native GPU Aurora Shader: fluid, organic northern lights hanging from top */}
      <Aurora
        colorStops={auroraColorStops}
        amplitude={1.0}
        blend={0.55}
        height={0.75}
        speed={0.65}
        scale={1.0}
        glow={0.6}
        brightness={0.95}
        layers={1}
        direction="top"
        lightMode={!isDark}
        paused={shouldPause}
        style={StyleSheet.absoluteFill}
      />

      {/* Bottom Scrim Dissolve: Melts cleanly into page background */}
      <LinearGradient
        colors={['transparent', `${colors.background}80`, colors.background]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.bottomDissolveScrim}
      />
    </Animated.View>
  );
});

export default ExploreAmbientMeshBackdrop;

const styles = StyleSheet.create({
  rootContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    zIndex: 0,
  },
  bottomDissolveScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
  },
});
