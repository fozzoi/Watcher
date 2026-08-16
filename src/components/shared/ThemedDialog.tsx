import React from 'react';
import { 
  View, Text, Modal, TouchableOpacity, StyleSheet, Dimensions 
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';

export interface DialogButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive' | 'primary';
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
      return <Ionicons name={iconName as any} size={28} color="#E50914" />;
    }
    switch (type) {
      case 'success':
        return <Ionicons name="checkmark-circle-outline" size={32} color="#30D158" />;
      case 'warning':
        return <Ionicons name="alert-circle-outline" size={32} color="#FF9F0A" />;
      case 'danger':
        return <Ionicons name="trash-outline" size={30} color="#FF453A" />;
      case 'info':
      default:
        return <MaterialCommunityIcons name="filmstrip" size={30} color="#E50914" />;
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

          <View style={[styles.buttonRow, buttons.length > 2 && styles.buttonColumn]}>
            {buttons.map((btn, idx) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              const isPrimary = btn.style === 'primary' || (!btn.style && idx === buttons.length - 1);

              return (
                <TouchableOpacity
                  key={idx}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (btn.onPress) btn.onPress();
                    if (onClose) onClose();
                  }}
                  style={[
                    styles.button,
                    isCancel && styles.buttonCancel,
                    isDestructive && styles.buttonDestructive,
                    isPrimary && !isDestructive && styles.buttonPrimary,
                    buttons.length > 2 && { width: '100%', marginBottom: 8 }
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
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: Math.min(width - 48, 360),
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 12,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex-Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex-Regular',
    color: '#A0A0A0',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 4,
  },
  buttonColumn: {
    flexDirection: 'column',
    gap: 0,
  },
  button: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 14,
    fontFamily: 'GoogleSansFlex-Medium',
    color: '#FFFFFF',
  },
  buttonTextCancel: {
    color: '#8E8E93',
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
