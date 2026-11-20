import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedViewBase from '@react-native-masked-view/masked-view';
import { useAppTheme } from '../../theme';

/**
 * A blur that fades out along one edge, optionally tinted with an extracted
 * palette colour.
 *
 * `expo-blur` can only blur uniformly, so the gradient is produced by masking a
 * BlurView with a linear gradient — the blurred copy dissolves into the sharp
 * content underneath, which reads as "blur strength decreasing to zero".
 *
 * Two operating modes:
 *
 * - With `blurTarget`: real blur (Android requires a BlurTargetView ref) plus
 *   the colour scrim on top.
 * - Without it: colour scrim only. Still correct for edge fades over flat
 *   backgrounds, and used where no blur target exists.
 *
 * The scrim is always drawn, so a device that cannot blur still gets a clean
 * gradient instead of a hard edge.
 */

type EdgePosition = 'top' | 'bottom';

export interface GradientBlurProps {
  /** Which screen edge the blur fades away from. Default: `'top'`. */
  position?: EdgePosition;
  /** Height of the effect in dp. Default: 96. */
  height?: number;
  /** Tint colour. Defaults to the theme background. */
  color?: string;
  /** Blur intensity, 0-100. Default: 70. */
  intensity?: number;
  /** Ref to the enclosing BlurTargetView. Omit for scrim-only rendering. */
  blurTarget?: React.RefObject<any> | null;
  /** Explicit blur tint ('dark' | 'light'). Defaults to isDark ? 'dark' : 'light'. */
  tint?: 'dark' | 'light';
  style?: StyleProp<ViewStyle>;
}

// Multiple low-contrast stops make the fade less prone to visible color bands.
const FADE_LOCATIONS: readonly [number, number, number, number, number] = [0, 0.25, 0.5, 0.75, 1];

const withAlpha = (color: string, alpha: number): string => {
  const value = (color || '').trim();
  const hex = value.startsWith('#') ? value.slice(1) : '';
  const normalizedHex = hex.length === 3 || hex.length === 4
    ? hex.slice(0, 3).split('').map((char) => char + char).join('')
    : hex.length === 8
      ? hex.slice(0, 6)
      : hex;
  if (/^[\da-f]{6}$/i.test(normalizedHex)) {
    const channels = [0, 2, 4].map((index) => parseInt(normalizedHex.slice(index, index + 2), 16));
    return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
  }

  const rgb = value.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;

  // Theme surfaces are normally hex/RGB. Keep an explicit neutral fallback for named colours.
  return `rgba(0, 0, 0, ${alpha})`;
};

export const GradientBlur: React.FC<GradientBlurProps> = ({
  position = 'top',
  height = 96,
  color,
  intensity = 70,
  blurTarget,
  tint,
  style,
}) => {
  const { colors, isDark } = useAppTheme();
  const base = color || colors.background;
  const resolvedTint = tint || (isDark ? 'dark' : 'light');

  // Give the BlurTargetView time to mount before rendering BlurView. Keep
  // checking briefly so a slower screen mount still enables real blur.
  const [targetReady, setTargetReady] = useState(() => Boolean(blurTarget?.current));
  useEffect(() => {
    if (!blurTarget) {
      setTargetReady(false);
      return;
    }
    if (blurTarget.current) {
      setTargetReady(true);
      return;
    }
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (blurTarget.current) {
        setTargetReady(true);
        clearInterval(timer);
      } else if (attempts >= 40) {
        clearInterval(timer);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [blurTarget]);

  const scrim = useMemo(() => {
    const strong = withAlpha(base, 0.48);
    const upperMid = withAlpha(base, 0.34);
    const lowerMid = withAlpha(base, 0.18);
    const soft = withAlpha(base, 0.07);
    const clear = withAlpha(base, 0);
    return (position === 'top'
      ? [strong, upperMid, lowerMid, soft, clear]
      : [clear, soft, lowerMid, upperMid, strong]) as [string, string, string, string, string];
  }, [base, position]);

  const mask = useMemo(
    () =>
      (position === 'top'
        ? ['#000', 'rgba(0,0,0,0.86)', 'rgba(0,0,0,0.60)', 'rgba(0,0,0,0.26)', 'transparent']
        : ['transparent', 'rgba(0,0,0,0.26)', 'rgba(0,0,0,0.60)', 'rgba(0,0,0,0.86)', '#000']) as [string, string, string, string, string],
    [position]
  );

  const edgeStyle = position === 'top' ? styles.edgeTop : styles.edgeBottom;

  return (
    <View pointerEvents="none" style={[styles.container, edgeStyle, { height }, style]}>
      {blurTarget && targetReady ? (
        <MaskedView
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          // Hardware rendering keeps the RenderEffect-based blur alive while the
          // gradient mask is composited. Software mode would draw it unblurred.
          androidRenderingMode="hardware"
          maskElement={
            <LinearGradient colors={mask} locations={FADE_LOCATIONS} style={StyleSheet.absoluteFill} />
          }
        >
          <BlurView
            intensity={intensity}
            tint={resolvedTint}
            blurMethod="dimezisBlurView"
            blurTarget={blurTarget}
            style={StyleSheet.absoluteFill}
          />
        </MaskedView>
      ) : null}

      <LinearGradient colors={scrim} locations={FADE_LOCATIONS} style={StyleSheet.absoluteFill} />
    </View>
  );
};

// `@react-native-masked-view` ships typings built against an older React Native
// surface (`NativeMethods`), which React 19's JSX types reject. The component
// itself is fine, so keep a properly-typed alias.
const MaskedView = MaskedViewBase as unknown as React.ComponentType<any>;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  edgeTop: {
    top: 0,
  },
  edgeBottom: {
    bottom: 0,
  },
});

export default GradientBlur;
