// src/components/aichat/ChatHistorySidebar.tsx
//
// Slide-in drawer with swipe-to-close.
// Fixes vs. the old version:
//  - PanResponder no longer captures stale onClose/onSelect (callbacks live in a ref)
//  - one Animated.Value drives both panel and backdrop (they can't drift apart)
//  - onSelect / onNewChat also close the drawer, so the parent can't forget
//  - delete asks for confirmation; Modal covers the status bar on Android

import React, { useCallback, useEffect, useRef } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Conversation } from '../../chatStorage';
import { ai } from './aiTheme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const PANEL_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 340);

type Props = {
  visible: boolean;
  conversations: Conversation[];
  activeId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
};

const ChatHistorySidebar = (props: Props) => {
  const { visible, conversations, activeId } = props;
  const insets = useSafeAreaInsets();

  // always-fresh callbacks for the (created-once) PanResponder
  const latest = useRef(props);
  latest.current = props;

  const translateX = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const backdropOpacity = useRef(
    translateX.interpolate({ inputRange: [-PANEL_WIDTH, 0], outputRange: [0, 1], extrapolate: 'clamp' })
  ).current;

  const open = useCallback(() => {
    Animated.timing(translateX, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  const close = useCallback(
    (after?: () => void) => {
      Animated.timing(translateX, {
        toValue: -PANEL_WIDTH,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        after?.();
        latest.current.onClose();
      });
    },
    [translateX]
  );

  useEffect(() => {
    if (visible) {
      translateX.setValue(-PANEL_WIDTH);
      open();
    }
  }, [visible, open, translateX]);

  const springBack = () =>
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dx < -10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => translateX.setValue(Math.min(0, g.dx)),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -PANEL_WIDTH * 0.25 || g.vx < -0.5) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          close();
        } else {
          springBack();
        }
      },
      onPanResponderTerminate: springBack,
    })
  ).current;

  const confirmDelete = (id: string, title: string) => {
    Alert.alert('Delete this chat?', title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          latest.current.onDelete(id);
        },
      },
    ]);
  };

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => close()}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Close history" />
      </Animated.View>

      <Animated.View
        {...pan.panHandlers}
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
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.newChatBtn}
            onPress={() => close(() => latest.current.onNewChat())}
            accessibilityRole="button"
            accessibilityLabel="New chat"
          >
            <Ionicons name="add" size={18} color={ai.accent} />
            <Text style={styles.newChatText}>New chat</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.closeBtn}
            onPress={() => close()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="chevron-back" size={20} color={ai.textMute} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>History</Text>

        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={26} color={ai.textMute} />
              <Text style={styles.emptyTitle}>No chats yet</Text>
              <Text style={styles.emptySub}>Ask about a movie and it will show up here.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const active = item.id === activeId;
            return (
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.row, active && styles.rowActive]}
                onPress={() => close(() => latest.current.onSelect(item.id))}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text numberOfLines={1} style={[styles.rowText, active && styles.rowTextActive]}>
                  {item.title || 'Untitled chat'}
                </Text>
                <TouchableOpacity
                  hitSlop={12}
                  onPress={() => confirmDelete(item.id, item.title || 'Untitled chat')}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${item.title}`}
                >
                  <Ionicons name="trash-outline" size={16} color="#6E6E78" />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      </Animated.View>
    </Modal>
  );
};

export default ChatHistorySidebar;

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: ai.bg,
    paddingHorizontal: 14,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255,255,255,0.12)',
    elevation: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 },
  newChatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ai.border,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  newChatText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: ai.hairline,
  },
  sectionLabel: { color: ai.textMute, fontSize: 12, fontWeight: '600', marginBottom: 8, paddingHorizontal: 4 },
  listContent: { paddingBottom: 20, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 2,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
  },
  rowActive: { backgroundColor: ai.accentSoft, borderLeftColor: ai.accent },
  rowText: { flex: 1, color: ai.textDim, fontSize: 14 },
  rowTextActive: { color: '#FFFFFF', fontWeight: '600' },
  empty: { alignItems: 'center', gap: 6, marginTop: 40, paddingHorizontal: 12 },
  emptyTitle: { color: ai.textDim, fontSize: 14, fontWeight: '600' },
  emptySub: { color: ai.textMute, fontSize: 12.5, textAlign: 'center' },
});