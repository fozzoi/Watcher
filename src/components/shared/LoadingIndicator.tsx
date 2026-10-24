import React, { memo } from 'react';
import {
  Platform,
  View,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
  ColorValue,
} from 'react-native';
import { Host, LoadingIndicator as ComposeLoadingIndicator } from '@expo/ui/jetpack-compose';
import { size as composeSize } from '@expo/ui/jetpack-compose/modifiers';
import { useAppTheme } from '../../theme';

export interface LoadingIndicatorProps {
  size?: 'small' | 'large' | number;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
  animating?: boolean;
}

export const LoadingIndicator = memo(
  ({
    size = 'small',
    color,
    style,
    animating = true,
  }: LoadingIndicatorProps) => {
    const { colors, isDark } = useAppTheme();
    if (!animating) return null;

    const resolvedColor = color || colors.primary;
    const numSize = typeof size === 'number' ? size : size === 'large' ? 36 : 22;

    if (Platform.OS === 'android') {
      return (
        <View style={[styles.container, { width: numSize, height: numSize }, style]}>
          <Host
            colorScheme={isDark ? 'dark' : 'light'}
            matchContents
            style={{
              width: numSize,
              height: numSize,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <ComposeLoadingIndicator
              color={resolvedColor}
              modifiers={[composeSize(numSize, numSize)]}
            />
          </Host>
        </View>
      );
    }

    return (
      <ActivityIndicator
        size={typeof size === 'number' ? (size > 28 ? 'large' : 'small') : size}
        color={resolvedColor as string}
        style={style}
        animating={animating}
      />
    );
  }
);

export default LoadingIndicator;

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
