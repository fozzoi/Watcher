// src/chatStorage.ts
//
// Local persistence for chat history + a small rolling "memory" of the
// user's taste, so a brand-new chat can still feel like it knows you.
// Everything lives in AsyncStorage — nothing leaves the device.

import AsyncStorage from '@react-native-async-storage/async-storage';

const CONVOS_KEY = 'watcher.chat.conversations.v1';
const MEMORY_KEY = 'watcher.chat.userMemory.v1';

export type StoredMessage = Record<string, any>; // same shape as ChatMessage minus the React-only bits

export type Conversation = {
  id: string;
  title: string;          // derived from the first user message
  messages: StoredMessage[];
  updatedAt: number;
};

// ── Conversations ───────────────────────────────────────────────

export async function listConversations(): Promise<Conversation[]> {
  const raw = await AsyncStorage.getItem(CONVOS_KEY);
  const all: Conversation[] = raw ? JSON.parse(raw) : [];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveConversation(convo: Conversation): Promise<void> {
  const raw = await AsyncStorage.getItem(CONVOS_KEY);
  const all: Conversation[] = raw ? JSON.parse(raw) : [];
  const idx = all.findIndex((c) => c.id === convo.id);
  if (idx >= 0) all[idx] = convo;
  else all.push(convo);
  await AsyncStorage.setItem(CONVOS_KEY, JSON.stringify(all));
}

export async function deleteConversation(id: string): Promise<void> {
  const raw = await AsyncStorage.getItem(CONVOS_KEY);
  const all: Conversation[] = raw ? JSON.parse(raw) : [];
  await AsyncStorage.setItem(CONVOS_KEY, JSON.stringify(all.filter((c) => c.id !== id)));
}

export function titleFromFirstMessage(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed || 'New chat';
}

// ── User memory ─────────────────────────────────────────────────
// A short free-text profile ("likes 90s action, loves Tarantino, dislikes
// horror") that gets fed into the system prompt of every new chat.

export async function getUserMemory(): Promise<string> {
  return (await AsyncStorage.getItem(MEMORY_KEY)) ?? '';
}

export async function setUserMemory(memory: string): Promise<void> {
  await AsyncStorage.setItem(MEMORY_KEY, memory.trim());
}

export async function clearUserMemory(): Promise<void> {
  await AsyncStorage.removeItem(MEMORY_KEY);
}

// ── AI assistant name ───────────────────────────────────────────
// Let the user pick a custom name for their movie assistant.

const AI_NAME_KEY = 'watcher.chat.aiName.v1';

export async function getAiName(): Promise<string> {
  return (await AsyncStorage.getItem(AI_NAME_KEY)) ?? '';
}

export async function setAiName(name: string): Promise<void> {
  await AsyncStorage.setItem(AI_NAME_KEY, name.trim());
}