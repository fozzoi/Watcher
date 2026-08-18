import React from 'react';
import { 
  View, Text, Modal, TouchableOpacity, StyleSheet, Dimensions, Platform 
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';

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
  if (!visible) return null;

  const getIcon = () => {
    if (iconName) {
      return <Ionicons name={iconName as any} size={30} color="#E50914" />;
    }
    switch (type) {
      case 'success':
        return <Ionicons name="checkmark-circle-outline" size={34} color="#30D158" />;
      case 'warning':
        return <Ionicons name="alert-circle-outline" size={34} color="#FF9F0A" />;
      case 'danger':
        return <Ionicons name="trash-outline" size={32} color="#FF453A" />;
      case 'info':
      default:
        return <MaterialCommunityIcons name="filmstrip" size={32} color="#E50914" />;
    }
  };

  const getIconBg = () => {
    switch (type) {
      case 'success':
        return 'rgba(48, 209, 88, 0.12)';
      case 'warning':
        return 'rgba(255, 159, 10, 0.12)';
      case 'danger':
        return 'rgba(255, 69, 58, 0.12)';
      case 'info':
      default:
        return 'rgba(229, 9, 20, 0.12)';
    }
  };

  const getIconBorder = () => {
    switch (type) {
      case 'success':
        return 'rgba(48, 209, 88, 0.3)';
      case 'warning':
        return 'rgba(255, 159, 10, 0.3)';
      case 'danger':
        return 'rgba(255, 69, 58, 0.3)';
      case 'info':
      default:
        return 'rgba(229, 9, 20, 0.3)';
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
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={[styles.iconContainer, { backgroundColor: getIconBg(), borderColor: getIconBorder() }]}>
            {getIcon()}
          </View>

          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

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
                    !isVerticalStack && styles.buttonInRow,
                    isVerticalStack && styles.buttonInStack,
                    isCancel && styles.buttonCancel,
                    isDestructive && styles.buttonDestructive,
                    isPrimary && !isDestructive && styles.buttonPrimary,
                  ]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      isCancel && styles.buttonTextCancel,
                      isDestructive && styles.buttonTextDestructive,
                      isPrimary && !isDestructive && styles.buttonTextPrimary,
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: Math.min(width - 40, 360),
    backgroundColor: '#121212', // Sleek dark solid color
    borderRadius: 28, // Rounder for modern minimal look
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)', // Subtle edge
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 12,
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
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex-Regular',
    color: '#A0A0A0',
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
    backgroundColor: '#2C2C2E',
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
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  buttonPrimary: {
    backgroundColor: '#E50914',
  },
  buttonDestructive: {
    backgroundColor: 'rgba(255, 69, 58, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.4)',
  },
  buttonText: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex-Bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  buttonTextCancel: {
    color: '#8E8E93',
    fontFamily: 'GoogleSansFlex-Medium',
  },
  buttonTextPrimary: {
    color: '#FFFFFF',
    fontFamily: 'GoogleSansFlex-Bold',
  },
  buttonTextDestructive: {
    color: '#FF453A',
    fontFamily: 'GoogleSansFlex-Bold',
  },
});
