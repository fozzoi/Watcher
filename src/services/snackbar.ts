import { Platform, ToastAndroid } from 'react-native';

export type SnackbarDuration = 'short' | 'long' | 'indefinite';

export interface SnackbarConfig {
  message: string;
  actionLabel?: string;
  duration?: SnackbarDuration;
  onAction?: () => void;
  onDismiss?: () => void;
}

type SnackbarListener = (config: SnackbarConfig) => void;

class SnackbarService {
  private listener: SnackbarListener | null = null;

  registerListener(listener: SnackbarListener) {
    this.listener = listener;
    return () => {
      if (this.listener === listener) {
        this.listener = null;
      }
    };
  }

  show(config: SnackbarConfig) {
    if (this.listener) {
      this.listener(config);
    } else if (Platform.OS === 'android') {
      ToastAndroid.show(config.message, ToastAndroid.SHORT);
    }
  }
}

export const snackbarService = new SnackbarService();
