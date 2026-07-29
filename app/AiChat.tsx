import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  Image, ActivityIndicator, StyleSheet, StatusBar, Keyboard,
  KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
// ^ only works when this screen is rendered inside a Bottom Tab Navigator.
//   If it isn't, remove this import + the hook call below and go back to
//   just `insets.bottom` in the inputBar padding.
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';

import { getImageUrl, getFullDetails } from '../src/tmdb';
import { getGeminiChatReply, updateUserMemory } from '../src/aiChat';
// ^ new function — see src/aiChat.ts. It wraps your existing Gemini calls but
//   asks the model to return structured JSON instead of a plain movie array,
//   so the chat can decide what kind of bubble to render.
import {
  Conversation, listConversations, saveConversation, deleteConversation,
  titleFromFirstMessage, getUserMemory, setUserMemory,
} from '../src/chatStorage';
import ChatHistorySidebar from './components/ChatHistorySidebar';

const { width } = Dimensions.get('window');

// ────────────────────────────────────────────────────────────────
// Message schema
// ────────────────────────────────────────────────────────────────
// One chat = an array of ChatMessage. `role` decides bubble alignment.
// `kind` decides what's rendered inside the bubble.

type Movie = {
  id: string | number;
  title: string;
  poster_path?: string;
  vote_average?: number;
  release_date?: string;
  overview?: string;
};

type Actor = {
  id: string | number;
  name: string;
  profile_path?: string;
  known_for?: string; // e.g. "Actor · Inception, Tenet"
};

type ChatMessage =
  | { id: string; role: 'user'; kind: 'text'; text: string }
  | { id: string; role: 'bot'; kind: 'text'; text: string }
  | { id: string; role: 'bot'; kind: 'typing' }
  | { id: string; role: 'bot'; kind: 'movies'; text?: string; movies: Movie[] }
  | { id: string; role: 'bot'; kind: 'actors'; text?: string; actors: Actor[] }
  | { id: string; role: 'bot'; kind: 'movie_detail'; text?: string; movie: Movie }
  | { id: string; role: 'bot'; kind: 'error'; text: string };

const STARTER_PROMPTS = [
  '🤯 Mind-bending thriller',
  '🚀 Stunning sci-fi',
  '👻 Elevated horror',
  '🎲 Surprise me',
];

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// ────────────────────────────────────────────────────────────────
// Screen
// ────────────────────────────────────────────────────────────────

const AiChat = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const listRef = useRef<FlatList>(null);

  const GREETING: ChatMessage = {
    id: uid(),
    role: 'bot',
    kind: 'text',
    text: "Hey! Tell me a mood, a plot, an actor, or a vibe — I'll find something for you.",
  };

  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const [conversationId, setConversationId] = useState<string>(uid());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMemory, setUserMemoryState] = useState('');

  // Load saved chats + user profile once on mount.
  React.useEffect(() => {
    listConversations().then(setConversations);
    getUserMemory().then(setUserMemoryState);
  }, []);

  // Persist the current conversation any time it changes (skip the
  // untouched greeting-only state so empty chats don't clutter history).
  React.useEffect(() => {
    if (messages.length <= 1) return;
    const convo: Conversation = {
      id: conversationId,
      title: titleFromFirstMessage(
        (messages.find((m) => m.role === 'user') as any)?.text ?? 'New chat'
      ),
      messages: messages as any,
      updatedAt: Date.now(),
    };
    saveConversation(convo).then(() => listConversations().then(setConversations));
  }, [messages]);

  const startNewChat = () => {
    setConversationId(uid());
    setMessages([GREETING]);
    setSidebarOpen(false);
  };

  const openConversation = (id: string) => {
    const convo = conversations.find((c) => c.id === id);
    if (!convo) return;
    setConversationId(convo.id);
    setMessages(convo.messages as ChatMessage[]);
    setSidebarOpen(false);
  };

  const removeConversation = async (id: string) => {
    await deleteConversation(id);
    const updated = await listConversations();
    setConversations(updated);
    if (id === conversationId) startNewChat();
  };

  const scrollToEnd = () => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  const pushMessage = (m: ChatMessage) => {
    setMessages((prev) => [...prev, m]);
    scrollToEnd();
  };

  const handleSend = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || sending) return;

    Keyboard.dismiss();
    setInput('');
    setSending(true);

    pushMessage({ id: uid(), role: 'user', kind: 'text', text });
    const typingId = uid();
    pushMessage({ id: typingId, role: 'bot', kind: 'typing' });

    try {
      // getGeminiChatReply talks to Gemini + your TMDB/imdbapi layer and
      // returns one structured reply. See src/aiChat.ts for the contract.
      const reply = await getGeminiChatReply(text, messages, userMemory);

      setMessages((prev) => {
        const withoutTyping = prev.filter((m) => m.id !== typingId);
        return [...withoutTyping, { id: uid(), ...reply } as ChatMessage];
      });
      scrollToEnd();

      // Fire-and-forget: keep the rolling taste profile current. Doesn't
      // block the UI — the next message just picks up the fresh memory.
      updateUserMemory(userMemory, text).then((updated) => {
        if (updated && updated !== userMemory) {
          setUserMemoryState(updated);
          setUserMemory(updated);
        }
      });
    } catch (e) {
      setMessages((prev) => {
        const withoutTyping = prev.filter((m) => m.id !== typingId);
        return [
          ...withoutTyping,
          { id: uid(), role: 'bot', kind: 'error', text: "Couldn't reach the AI — try again?" },
        ];
      });
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, userMemory]);

  const openMovie = async (item: Movie) => {
    const full = await getFullDetails(item);
    navigation.navigate('Detail', { movie: full });
  };

  const openActor = (actor: Actor) => {
    // Wire this up to whatever actor/person detail route you have.
    navigation.navigate('Person', { actor });
  };

  // ── Renderers per message kind ──────────────────────────────

  const renderTextBubble = (m: Extract<ChatMessage, { kind: 'text' }>) => (
    <View style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleBot]}>
      <Text style={m.role === 'user' ? styles.bubbleUserText : styles.bubbleBotText}>
        {m.text}
      </Text>
    </View>
  );

  const renderError = (m: Extract<ChatMessage, { kind: 'error' }>) => (
    <View style={[styles.bubble, styles.bubbleError]}>
      <Ionicons name="alert-circle-outline" size={16} color="#FF6B6B" />
      <Text style={styles.bubbleErrorText}>{m.text}</Text>
    </View>
  );

  const renderTyping = () => (
    <View style={[styles.bubble, styles.bubbleBot, { flexDirection: 'row', gap: 4 }]}>
      <TypingDots />
    </View>
  );

  const renderMovieList = (m: Extract<ChatMessage, { kind: 'movies' }>) => (
    <View style={{ marginBottom: 4 }}>
      {!!m.text && <View style={[styles.bubble, styles.bubbleBot]}><Text style={styles.bubbleBotText}>{m.text}</Text></View>}
      <FlatList
        horizontal
        data={m.movies}
        keyExtractor={(item) => String(item.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingVertical: 8 }}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInUp.delay(index * 60).springify()}>
            <TouchableOpacity activeOpacity={0.9} style={styles.movieCard} onPress={() => openMovie(item)}>
              <Image source={{ uri: getImageUrl(item.poster_path, 'w185') }} style={styles.moviePoster} />
              <View style={styles.movieMetaRow}>
                <Ionicons name="star" color="#FFD700" size={10} />
                <Text style={styles.movieRating}>{item.vote_average?.toFixed(1) ?? '–'}</Text>
              </View>
              <Text numberOfLines={2} style={styles.movieTitle}>{item.title}</Text>
              <Text style={styles.movieYear}>{item.release_date?.split('-')[0] || ''}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      />
    </View>
  );

  const renderActorList = (m: Extract<ChatMessage, { kind: 'actors' }>) => (
    <View style={{ marginBottom: 4 }}>
      {!!m.text && <View style={[styles.bubble, styles.bubbleBot]}><Text style={styles.bubbleBotText}>{m.text}</Text></View>}
      <FlatList
        horizontal
        data={m.actors}
        keyExtractor={(item) => String(item.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 16, paddingVertical: 8 }}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInUp.delay(index * 60).springify()}>
            <TouchableOpacity activeOpacity={0.9} style={styles.actorCard} onPress={() => openActor(item)}>
              <Image source={{ uri: getImageUrl(item.profile_path, 'w185') }} style={styles.actorAvatar} />
              <Text numberOfLines={1} style={styles.actorName}>{item.name}</Text>
              {!!item.known_for && <Text numberOfLines={1} style={styles.actorKnownFor}>{item.known_for}</Text>}
            </TouchableOpacity>
          </Animated.View>
        )}
      />
    </View>
  );

  const renderMovieDetail = (m: Extract<ChatMessage, { kind: 'movie_detail' }>) => (
    <View style={{ marginBottom: 4 }}>
      {!!m.text && <View style={[styles.bubble, styles.bubbleBot]}><Text style={styles.bubbleBotText}>{m.text}</Text></View>}
      <TouchableOpacity activeOpacity={0.9} style={styles.detailCard} onPress={() => openMovie(m.movie)}>
        <Image
          source={{ uri: getImageUrl(m.movie.poster_path, 'w92') }}
          style={styles.detailGlow}
          blurRadius={30}
        />
        <View style={styles.detailInner}>
          <Image source={{ uri: getImageUrl(m.movie.poster_path, 'w185') }} style={styles.detailPoster} />
          <View style={styles.detailContent}>
            <Text style={styles.detailTitle} numberOfLines={2}>{m.movie.title}</Text>
            <View style={styles.tagsRow}>
              <View style={styles.tag}>
                <Ionicons name="star" color="#FFD700" size={10} />
                <Text style={styles.tagText}>{m.movie.vote_average?.toFixed(1) ?? '–'}</Text>
              </View>
              <View style={[styles.tag, { backgroundColor: '#333' }]}>
                <Text style={[styles.tagText, { color: '#AAA' }]}>{m.movie.release_date?.split('-')[0] || 'N/A'}</Text>
              </View>
            </View>
            <Text style={styles.detailOverview} numberOfLines={4}>{m.movie.overview}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    switch (item.kind) {
      case 'text': return renderTextBubble(item);
      case 'typing': return renderTyping();
      case 'movies': return renderMovieList(item);
      case 'actors': return renderActorList(item);
      case 'movie_detail': return renderMovieDetail(item);
      case 'error': return renderError(item);
      default: return null;
    }
  };

  const showStarterChips = messages.length === 1;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <LinearGradient colors={['#0F0F0F', '#000']} style={StyleSheet.absoluteFill} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => setSidebarOpen(true)} hitSlop={10}>
          <Ionicons name="menu" size={22} color="white" />
        </TouchableOpacity>
        <MaterialCommunityIcons name="movie-open-outline" size={20} color="#FF3B3B" />
        <Text style={styles.headerTitle}>Movie Assistant</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={startNewChat} hitSlop={10}>
          <Ionicons name="create-outline" size={20} color="white" />
        </TouchableOpacity>
      </View>

      <ChatHistorySidebar
        visible={sidebarOpen}
        conversations={conversations}
        activeId={conversationId}
        onClose={() => setSidebarOpen(false)}
        onSelect={openConversation}
        onNewChat={startNewChat}
        onDelete={removeConversation}
      />

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        contentContainerStyle={{ paddingVertical: 12, paddingBottom: 24 }}
        onContentSizeChange={scrollToEnd}
      />

      {showStarterChips && (
        <Animated.View entering={FadeIn} style={styles.chipsRow}>
          {STARTER_PROMPTS.map((p) => (
            <TouchableOpacity key={p} style={styles.chip} onPress={() => handleSend(p)}>
              <Text style={styles.chipText}>{p}</Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      )}

      <View style={[styles.inputBar, { paddingBottom: tabBarHeight + 10 }]}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="Describe a plot, mood, or actor..."
            placeholderTextColor="#666"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => handleSend()}
            returnKeyType="send"
            editable={!sending}
          />
        </View>
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && { opacity: 0.4 }]}
          onPress={() => handleSend()}
          disabled={!input.trim() || sending}
        >
          {sending
            ? <ActivityIndicator size="small" color="#000" />
            : <Ionicons name="arrow-up" size={20} color="#000" />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

// Three-dot typing indicator
const TypingDots = () => {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          entering={FadeIn.delay(i * 150)}
          style={styles.typingDot}
        />
      ))}
    </>
  );
};

export default AiChat;

// ────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#222',
  },
  headerTitle: { color: 'white', fontSize: 16, fontWeight: '600' },

  // Text bubbles
  bubble: {
    maxWidth: width * 0.8, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
    marginHorizontal: 16, marginVertical: 4,
  },
  bubbleUser: { backgroundColor: '#FF3B3B', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleBot: { backgroundColor: '#1A1A1A', alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#2A2A2A' },
  bubbleUserText: { color: 'white', fontSize: 15, lineHeight: 20 },
  bubbleBotText: { color: '#EAEAEA', fontSize: 15, lineHeight: 20 },
  bubbleError: { backgroundColor: '#2A1414', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#4A1F1F' },
  bubbleErrorText: { color: '#FF9B9B', fontSize: 13 },

  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#888' },

  // Movie carousel cards
  movieCard: { width: 120 },
  moviePoster: { width: 120, height: 170, borderRadius: 10, backgroundColor: '#111' },
  movieMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 },
  movieRating: { color: '#DDD', fontSize: 11, fontWeight: '700' },
  movieTitle: { color: 'white', fontSize: 13, fontWeight: '600', marginTop: 2 },
  movieYear: { color: '#888', fontSize: 11, marginTop: 1 },

  // Actor carousel cards
  actorCard: { width: 88, alignItems: 'center' },
  actorAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#111', marginBottom: 6 },
  actorName: { color: 'white', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  actorKnownFor: { color: '#888', fontSize: 10, textAlign: 'center', marginTop: 1 },

  // Single movie detail card (mirrors original AiSearch card)
  detailCard: { height: 140, borderRadius: 12, backgroundColor: '#111', overflow: 'hidden', flexDirection: 'row', marginHorizontal: 16 },
  detailGlow: { position: 'absolute', width: '100%', height: '100%', opacity: 0.2 },
  detailInner: { flexDirection: 'row', flex: 1, backgroundColor: 'rgba(20,20,20,0.6)' },
  detailPoster: { width: 94, height: '100%' },
  detailContent: { flex: 1, padding: 12, justifyContent: 'center' },
  detailTitle: { color: 'white', fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  tagsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#222', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagText: { color: '#DDD', fontSize: 11, fontWeight: '700' },
  detailOverview: { color: '#999', fontSize: 12, lineHeight: 16 },

  // Starter chips
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  chip: { backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#333' },
  chipText: { color: '#AAA', fontSize: 12 },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#222',
  },
  inputWrapper: {
    flex: 1, backgroundColor: '#1A1A1A', height: 46, borderRadius: 23,
    borderWidth: 1, borderColor: '#333', justifyContent: 'center',
  },
  input: { color: 'white', paddingHorizontal: 16, fontSize: 15 },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#FF3B3B',
    alignItems: 'center', justifyContent: 'center',
  },
});