// src/components/explore/ExploreAmbientMeshBackdrop.tsx
import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { useSelector } from '@legendapp/state/react';
import { useAppTheme } from '../../theme';
import { useImagePalette, hexToHsl, hslToHex } from '../../utils/colorExtractor';
import { getImageUrl } from '../../tmdb';
import { heroActiveItem$ } from './HeroSection';
import { HERO_HEIGHT } from './ExploreConstants';

export interface NeonMeshShades {
  neonDominant: string;
  neonElectric: string;
  neonContrast: string;
  neonHighlight: string;
  neonDeep: string;
}

/**
 * Derives rich electric neon tones from the film palette.
 */
export function deriveNeonMeshShades(baseHex: string, isDark: boolean): NeonMeshShades {
  const [h, s, l] = hexToHsl(baseHex);

  if (s < 0.08) {
    return {
      neonDominant: isDark ? '#6366F1' : '#4F46E5', // Electric Indigo
      neonElectric: isDark ? '#06B6D4' : '#0891B2', // Electric Cyan
      neonContrast: isDark ? '#EC4899' : '#DB2777', // Hot Magenta
      neonHighlight: isDark ? '#A855F7' : '#9333EA', // Neon Violet
      neonDeep: isDark ? '#0F172A' : '#E2E8F0',
    };
  }

  // Pure neon saturation (92% - 100%) and glowing luminescence
  const neonSat = Math.max(0.92, Math.min(1.0, s * 1.35));
  const neonLight = isDark ? Math.max(0.48, Math.min(0.60, l * 1.15)) : Math.max(0.55, Math.min(0.68, l));

  return {
    neonDominant: hslToHex(h, neonSat, neonLight),
    neonElectric: hslToHex((h + 36) % 360, 1.0, Math.min(0.65, neonLight + 0.05)),
    neonContrast: hslToHex((h - 42 + 360) % 360, Math.min(1.0, neonSat * 1.05), Math.max(0.44, neonLight - 0.03)),
    neonHighlight: hslToHex((h + 72) % 360, 1.0, Math.min(0.68, neonLight + 0.08)),
    neonDeep: hslToHex(h, Math.min(0.92, neonSat * 0.9), isDark ? 0.20 : 0.82),
  };
}

export interface ExploreAmbientMeshBackdropProps {
  initialItem?: any;
  scrollY?: SharedValue<number>;
}

export const ExploreAmbientMeshBackdrop = memo(function ExploreAmbientMeshBackdrop({
  initialItem,
  scrollY,
}: ExploreAmbientMeshBackdropProps) {
  const { colors, isDark } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();

  const activeItem = useSelector(() => heroActiveItem$.item.get()) || initialItem;
  const imagePath = activeItem?.poster_path || activeItem?.backdrop_path || null;

  // Ultra-low resolution thumbnail (w92) provides a massive 300+ px optical
  // Gaussian blur when upscaled and blurred with radius=25.
  const blurThumbUrl = imagePath ? getImageUrl(imagePath, 'w92') : null;
  const highResUrl = imagePath ? getImageUrl(imagePath, 'w500') : null;

  const { palette } = useImagePalette(highResUrl);

  const shades = useMemo(() => {
    const baseColor = palette?.dominant || colors.primary;
    return deriveNeonMeshShades(baseColor, isDark);
  }, [palette?.dominant, colors.primary, isDark]);

  const topInset = StatusBar.currentHeight || (Platform.OS === 'ios' ? 44 : 28);
  const totalBackdropHeight = Math.round(HERO_HEIGHT + topInset + 120);

  // ── Dual-Buffer Cross-Fader (Zero Blinks, Continuous Dissolve) ──────────────
  const [currentBuffer, setCurrentBuffer] = useState<{
    url: string | null;
    shades: NeonMeshShades;
  }>(() => ({
    url: blurThumbUrl,
    shades,
  }));

  const [previousBuffer, setPreviousBuffer] = useState<{
    url: string | null;
    shades: NeonMeshShades;
  } | null>(null);

  const crossFade = useSharedValue(1);

  useEffect(() => {
    if (!blurThumbUrl) return;
    if (blurThumbUrl === currentBuffer.url) return;

    // Move current to previous buffer so it stays 100% visible while new buffer fades in
    setPreviousBuffer(currentBuffer);
    setCurrentBuffer({ url: blurThumbUrl, shades });

    // Smooth continuous cross-dissolve with zero opacity dips or blinks
    crossFade.value = 0;
    crossFade.value = withTiming(1, {
      duration: 650,
      easing: Easing.inOut(Easing.quad),
    });
  }, [blurThumbUrl, shades]);

  // ── Organic Ambient Drift & Breathing ──────────────────────────────────────
  const driftX = useSharedValue(0);
  const driftY = useSharedValue(0);
  const breathScale = useSharedValue(1.55);

  useEffect(() => {
    driftX.value = withRepeat(
      withSequence(
        withTiming(26, { duration: 8000, easing: Easing.inOut(Easing.quad) }),
        withTiming(-22, { duration: 8500, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );
    driftY.value = withRepeat(
      withSequence(
        withTiming(18, { duration: 7000, easing: Easing.inOut(Easing.quad) }),
        withTiming(-14, { duration: 7500, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );
    breathScale.value = withRepeat(
      withSequence(
        withTiming(1.68, { duration: 9000, easing: Easing.inOut(Easing.quad) }),
        withTiming(1.52, { duration: 8500, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );
  }, [driftX, driftY, breathScale]);

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: driftX.value },
      { translateY: driftY.value },
      { scale: breathScale.value },
    ],
  }));

  const crossFadeStyle = useAnimatedStyle(() => ({
    opacity: crossFade.value,
  }));

  // Synchronized scroll: scrolls naturally with page content on UI thread
  const animatedScrollStyle = useAnimatedStyle(() => {
    const y = scrollY ? scrollY.value : 0;
    return {
      transform: [{ translateY: -y }],
    };
  });

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
      <View style={StyleSheet.absoluteFill}>
        {/* BUFFER 1: Previous Slide (Remains visible underneath during transition) */}
        {previousBuffer?.url ? (
          <View style={StyleSheet.absoluteFill}>
            <Animated.View style={[StyleSheet.absoluteFill, animatedBackdropStyle]}>
              <Image
                source={{ uri: previousBuffer.url }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                blurRadius={25}
                cachePolicy="memory-disk"
                priority="high"
                transition={0}
              />
            </Animated.View>

            <LinearGradient
              colors={[
                `${previousBuffer.shades.neonDominant}80`,
                `${previousBuffer.shades.neonElectric}50`,
                `${previousBuffer.shades.neonContrast}25`,
                'transparent',
              ]}
              locations={[0, 0.32, 0.65, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        ) : null}

        {/* BUFFER 2: Current Slide (Dissolves in smoothly over previous buffer) */}
        {currentBuffer.url ? (
          <Animated.View style={[StyleSheet.absoluteFill, crossFadeStyle]}>
            <Animated.View style={[StyleSheet.absoluteFill, animatedBackdropStyle]}>
              <Image
                source={{ uri: currentBuffer.url }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                blurRadius={25}
                cachePolicy="memory-disk"
                priority="high"
                transition={0}
              />
            </Animated.View>

            {/* Electric Neon Infusion */}
            <LinearGradient
              colors={[
                `${currentBuffer.shades.neonDominant}80`,
                `${currentBuffer.shades.neonElectric}50`,
                `${currentBuffer.shades.neonContrast}25`,
                'transparent',
              ]}
              locations={[0, 0.32, 0.65, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            {/* Cross-Angle Aurora Glow Ribbon */}
            <LinearGradient
              colors={[
                `${currentBuffer.shades.neonElectric}60`,
                `${currentBuffer.shades.neonHighlight}35`,
                'transparent',
              ]}
              locations={[0, 0.40, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0.85 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        ) : null}
      </View>

      {/* Bottom Scrim Dissolve: Melts cleanly into dark page background */}
      <LinearGradient
        colors={['transparent', `${colors.background}85`, colors.background]}
        locations={[0, 0.50, 1]}
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
    height: 160,
  },
});
