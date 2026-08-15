// components/ChatHistorySidebar.tsx
//
// Slide-in drawer listing saved conversations — tap to reopen, swipe/press
// trash to delete, "New chat" at the top. Pairs with AiChat.tsx.

import React from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInLeft, SlideOutLeft } from 'react-native-reanimated';
import { Conversation } from '../../chatStorage';

type Props = {
  visible: boolean;
  conversations: Conversation[];
  activeId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
};

const ChatHistorySidebar = ({ visible, conversations, activeId, onClose, onSelect, onNewChat, onDelete }: Props) => {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View
        entering={SlideInLeft.duration(220)}
        exiting={SlideOutLeft.duration(180)}
        style={[styles.panel, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}
      >
        <TouchableOpacity activeOpacity={0.95} style={styles.newChatBtn} onPress={onNewChat}>
          <Ionicons name="add-circle-outline" size={18} color="#FF3B3B" />
          <Text style={styles.newChatText}>New chat</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>History</Text>

        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No past chats yet.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity activeOpacity={0.95}
              style={[styles.row, item.id === activeId && styles.rowActive]}
              onPress={() => onSelect(item.id)}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={item.id === activeId ? '#FF3B3B' : '#888'} />
              <Text numberOfLines={1} style={[styles.rowText, item.id === activeId && { color: 'white' }]}>
                {item.title}
              </Text>
              <TouchableOpacity activeOpacity={0.95} hitSlop={10} onPress={() => onDelete(item.id)}>
                <Ionicons name="trash-outline" size={15} color="#555" />
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
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  panel: {
    position: 'absolute', top: 0, bottom: 0, left: 0, width: '78%', maxWidth: 320,
    backgroundColor: '#0C0C0C', paddingHorizontal: 14,
    borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: '#222',
  },
  newChatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1A1A1A', borderRadius: 10, borderWidth: 1, borderColor: '#333',
    paddingVertical: 12, paddingHorizontal: 12, marginBottom: 18,
  },
  newChatText: { color: 'white', fontWeight: '600', fontSize: 14 },
  sectionLabel: { color: '#666', fontSize: 12, fontWeight: '600', marginBottom: 8, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyText: { color: '#555', fontSize: 13, marginTop: 20, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8, marginBottom: 2,
  },
  rowActive: { backgroundColor: '#1A1A1A' },
  rowText: { flex: 1, color: '#AAA', fontSize: 13.5 },
});
