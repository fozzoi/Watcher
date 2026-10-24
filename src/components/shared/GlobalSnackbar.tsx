import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, ToastAndroid } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSegments } from 'expo-router';
import {
  Host,
  SnackbarHost,
  SnackbarHostRef,
  Snackbar,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers';
import { snackbarService, SnackbarConfig } from '../../services/snackbar';
import { useAppTheme } from '../../theme';

export const GlobalSnackbar = () => {
  if (Platform.OS !== 'android') return null;

  const { colors, isDark } = useAppTheme();
  const snackbarHostRef = useRef<SnackbarHostRef>(null);
  const [activeCount, setActiveCount] = useState(0);
  const insets = useSafeAreaInsets();
  const segments = useSegments();

  // In tabs, dock height is ~60 + 35 = ~95dp. Place snackbar just above the dock.
  const isInTabs = Array.isArray(segments) && segments[0] === '(tabs)';
  const bottomOffset = isInTabs ? insets.bottom + 95 : Math.max(insets.bottom, 16) + 16;

  useEffect(() => {
    const unregister = snackbarService.registerListener(async (config: SnackbarConfig) => {
      if (!snackbarHostRef.current) {
        ToastAndroid.show(config.message, ToastAndroid.SHORT);
        return;
      }

      setActiveCount((prev) => prev + 1);
      try {
        const result = await snackbarHostRef.current.showSnackbar({
          message: config.message,
          actionLabel: config.actionLabel,
          duration: config.duration || (config.actionLabel ? 'short' : 'short'),
        });

        if (result === 'actionPerformed') {
          config.onAction?.();
        } else {
          config.onDismiss?.();
        }
      } catch (e) {
        console.warn('Snackbar display error:', e);
      } finally {
        setActiveCount((prev) => Math.max(0, prev - 1));
      }
    });

    return unregister;
  }, []);

  const isVisible = activeCount > 0;

  return (
    <View
      pointerEvents={isVisible ? 'box-none' : 'none'}
      style={[
        styles.overlay,
        {
          bottom: bottomOffset,
        },
      ]}
    >
      <Host colorScheme={isDark ? 'dark' : 'light'} matchContents style={styles.host}>
        <SnackbarHost ref={snackbarHostRef} modifiers={[fillMaxWidth()]}>
          <Snackbar
            containerColor={colors.inverseSurface}
            contentColor={colors.inverseOnSurface}
            actionContentColor={colors.inversePrimary || colors.primary}
            modifiers={[fillMaxWidth(), padding(16, 0, 16, 0)]}
          />
        </SnackbarHost>
      </Host>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 99999,
    elevation: 99999,
  },
  host: {
    width: '100%',
  },
});

export default GlobalSnackbar;
