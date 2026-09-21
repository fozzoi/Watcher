// src/utils/chatStorage.ts
// Local persistence for chat history and rolling user memory for AI companion

import { AsyncStorage } from './storage';

const CONVOS_KEY = 'watcher.chat.conversations.v1';
const MEMORY_KEY = 'watcher.chat.userMemory.v1';
const AI_NAME_KEY = 'watcher.chat.aiName.v1';

export type StoredMessage = Record<string, any>;

export type Conversation = {
  id: string;
  title: string;
  messages: StoredMessage[];
  updatedAt: number;
};

// ── Conversations ───────────────────────────────────────────────

export async function listConversations(): Promise<Conversation[]> {
  try {
    const raw = await AsyncStorage.getItem(CONVOS_KEY);
    const all: Conversation[] = raw ? JSON.parse(raw) : [];
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function saveConversation(convo: Conversation): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CONVOS_KEY);
    const all: Conversation[] = raw ? JSON.parse(raw) : [];
    const idx = all.findIndex((c) => c.id === convo.id);
    if (idx >= 0) all[idx] = convo;
    else all.push(convo);
    await AsyncStorage.setItem(CONVOS_KEY, JSON.stringify(all));
  } catch (e) {
    console.error('Failed to save conversation', e);
  }
}

export async function deleteConversation(id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CONVOS_KEY);
    const all: Conversation[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(CONVOS_KEY, JSON.stringify(all.filter((c) => c.id !== id)));
  } catch (e) {
    console.error('Failed to delete conversation', e);
  }
}

export function titleFromFirstMessage(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed || 'New chat';
}

// ── User memory ─────────────────────────────────────────────────

export async function getUserMemory(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(MEMORY_KEY)) ?? '';
  } catch {
    return '';
  }
}

export async function setUserMemory(memory: string): Promise<void> {
  try {
    await AsyncStorage.setItem(MEMORY_KEY, memory.trim());
  } catch (e) {
    console.error('Failed to set user memory', e);
  }
}

export async function clearUserMemory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(MEMORY_KEY);
  } catch (e) {
    console.error('Failed to clear user memory', e);
  }
}

// ── AI assistant name ───────────────────────────────────────────

export async function getAiName(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(AI_NAME_KEY)) ?? 'Cine';
  } catch {
    return 'Cine';
  }
}

export async function setAiName(name: string): Promise<void> {
  try {
    await AsyncStorage.setItem(AI_NAME_KEY, name.trim());
  } catch (e) {
    console.error('Failed to set AI name', e);
  }
}
