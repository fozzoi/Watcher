import React from 'react';
import { 
  View, Text, Modal, TouchableOpacity, StyleSheet, Dimensions, Platform 
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme, shadows } from '../../theme';

export interface DialogButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive' | 'primary';
  icon?: string;
}

export interface ThemedDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  type?: 'info' | 'success' | 'warning' | 'danger';
  buttons?: DialogButton[];
  onClose?: () => void;
  iconName?: string;
}

const { width } = Dimensions.get('window');

export const ThemedDialog: React.FC<ThemedDialogProps> = ({
  visible,
  title,
  message,
  type = 'info',
  buttons = [{ text: 'OK', style: 'primary' }],
  onClose,
  iconName,
}) => {
  const { colors } = useAppTheme();

  if (!visible) return null;

  const getIcon = () => {
    if (iconName) {
      return <Ionicons name={iconName as any} size={30} color={colors.primary} />;
    }
    switch (type) {
      case 'success':
        return <Ionicons name="checkmark-circle-outline" size={34} color={colors.success} />;
      case 'warning':
        return <Ionicons name="alert-circle-outline" size={34} color={colors.warning} />;
      case 'danger':
        return <Ionicons name="trash-outline" size={32} color={colors.error} />;
      case 'info':
      default:
        return <MaterialCommunityIcons name="filmstrip" size={32} color={colors.primary} />;
    }
  };

  const getIconBg = () => {
    switch (type) {
      case 'success':
        return `${colors.success}1F`;
      case 'warning':
        return `${colors.warning}1F`;
      case 'danger':
        return `${colors.error}1F`;
      case 'info':
      default:
        return `${colors.primary}1F`;
    }
  };

  const getIconBorder = () => {
    switch (type) {
      case 'success':
        return `${colors.success}4D`;
      case 'warning':
        return `${colors.warning}4D`;
      case 'danger':
        return `${colors.error}4D`;
      case 'info':
      default:
        return `${colors.primary}4D`;
    }
  };

  const isVerticalStack = buttons.length > 2;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.surfaceContainer, borderColor: colors.border }]}>
          <View style={[styles.iconContainer, { backgroundColor: getIconBg(), borderColor: getIconBorder() }]}>
            {getIcon()}
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {message ? <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text> : null}

          <View style={isVerticalStack ? styles.buttonStack : styles.buttonRow}>
            {buttons.map((btn, idx) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              const isPrimary = btn.style === 'primary' || (!btn.style && idx === buttons.length - 1 && !isVerticalStack);

              return (
                <TouchableOpacity
                  key={idx}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (btn.onPress) btn.onPress();
                    if (onClose) onClose();
                  }}
                  style={[
                    styles.buttonBase,
                    { backgroundColor: colors.surfaceContainerHigh },
                    !isVerticalStack && styles.buttonInRow,
                    isVerticalStack && styles.buttonInStack,
                    isCancel && [styles.buttonCancel, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.border }],
                    isDestructive && [styles.buttonDestructive, { backgroundColor: `${colors.error}26`, borderColor: `${colors.error}66` }],
                    isPrimary && !isDestructive && [styles.buttonPrimary, { backgroundColor: colors.primary }],
                  ]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      { color: colors.text },
                      isCancel && [styles.buttonTextCancel, { color: colors.textSecondary }],
                      isDestructive && [styles.buttonTextDestructive, { color: colors.error }],
                      isPrimary && !isDestructive && [styles.buttonTextPrimary, { color: colors.onPrimary }],
                    ]}
                  >
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: Math.min(width - 40, 360),
    borderRadius: 28, // Rounder for modern minimal look
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    ...shadows.xl,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: 'GoogleSansFlex-Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex-Regular',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 4,
  },
  buttonStack: {
    flexDirection: 'column',
    width: '100%',
    marginTop: 4,
    gap: 10,
  },
  buttonBase: {
    minHeight: 50,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInRow: {
    flex: 1,
  },
  buttonInStack: {
    width: '100%',
  },
  buttonCancel: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  buttonPrimary: {},
  buttonDestructive: {
    borderWidth: 1,
  },
  buttonText: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex-Bold',
    textAlign: 'center',
  },
  buttonTextCancel: {
    fontFamily: 'GoogleSansFlex-Medium',
  },
  buttonTextPrimary: {
    fontFamily: 'GoogleSansFlex-Bold',
  },
  buttonTextDestructive: {
    fontFamily: 'GoogleSansFlex-Bold',
  },
});
