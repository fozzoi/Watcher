// components/ChatHistorySidebar.tsx
//
// Slide-in drawer listing saved conversations with full swipe-to-dismiss gesture control.

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  Pressable,
  Animated,
  PanResponder,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Conversation } from '../../chatStorage';

const SCREEN_WIDTH = Dimensions.get('window').width;
const PANEL_WIDTH = Math.min(SCREEN_WIDTH * 0.8, 320);

type Props = {
  visible: boolean;
  conversations: Conversation[];
  activeId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
};

const ChatHistorySidebar = ({
  visible,
  conversations,
  activeId,
  onClose,
  onSelect,
  onNewChat,
  onDelete,
}: Props) => {
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const animateIn = () => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const animateOut = (callback?: () => void) => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: -PANEL_WIDTH,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (callback) callback();
      else onClose();
    });
  };

  useEffect(() => {
    if (visible) {
      translateX.setValue(-PANEL_WIDTH);
      backdropOpacity.setValue(0);
      animateIn();
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Trigger swipe when moving left more than 8px
        return gestureState.dx < -8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          translateX.setValue(gestureState.dx);
          const progress = Math.max(0, 1 + gestureState.dx / PANEL_WIDTH);
          backdropOpacity.setValue(progress);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -70 || gestureState.vx < -0.4) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          animateOut();
        } else {
          Animated.parallel([
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 4,
            }),
            Animated.timing(backdropOpacity, {
              toValue: 1,
              duration: 120,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    })
  ).current;

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={() => animateOut()}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => animateOut()} />
      </Animated.View>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.panel,
          {
            width: PANEL_WIDTH,
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 12,
            transform: [{ translateX }],
          },
        ]}
      >
        {/* Header with Close / Swipe Hint */}
        <View style={styles.sidebarHeader}>
          <TouchableOpacity
            activeOpacity={0.95}
            style={styles.newChatBtn}
            onPress={() => {
              animateOut(() => onNewChat());
            }}
          >
            <Ionicons name="add-circle-outline" size={18} color="#FF3B3B" />
            <Text style={styles.newChatText}>New chat</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.closeBtn}
            onPress={() => animateOut()}
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={20} color="#888" />
          </TouchableOpacity>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>History</Text>
          <Text style={styles.swipeHint}>Swipe left to close</Text>
        </View>

        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={styles.emptyText}>No past chats yet.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.95}
              style={[styles.row, item.id === activeId && styles.rowActive]}
              onPress={() => {
                animateOut(() => onSelect(item.id));
              }}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={16}
                color={item.id === activeId ? '#FF3B3B' : '#888'}
              />
              <Text
                numberOfLines={1}
                style={[styles.rowText, item.id === activeId && { color: 'white', fontWeight: '600' }]}
              >
                {item.title}
              </Text>
              <TouchableOpacity
                activeOpacity={0.95}
                hitSlop={10}
                onPress={() => onDelete(item.id)}
              >
                <Ionicons name="trash-outline" size={15} color="#666" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      </Animated.View>
    </Modal>
  );
};

export default ChatHistorySidebar;

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#0F0F12',
    paddingHorizontal: 14,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 16,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  newChatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  newChatText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionLabel: {
    color: '#777',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  swipeHint: {
    color: '#555',
    fontSize: 10,
  },
  emptyText: {
    color: '#555',
    fontSize: 13,
    marginTop: 24,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 4,
  },
  rowActive: {
    backgroundColor: 'rgba(255,59,59,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,59,0.25)',
  },
  rowText: {
    flex: 1,
    color: '#BBB',
    fontSize: 13.5,
  },
});
