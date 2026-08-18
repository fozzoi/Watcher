import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  Image, ActivityIndicator, StyleSheet, StatusBar, Keyboard,
  KeyboardAvoidingView, Platform, Dimensions, Modal, Pressable,
  PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInUp, FadeIn, FadeInDown, FadeOut,
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withSpring, withSequence, withDelay, Easing,
  interpolateColor, SlideInRight, ZoomIn, runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { getSavedItems } from '../../src/database';

import { getImageUrl, getFullDetails, fetchChatGemini, fetchPersonalisedDiscoveryContent } from '../../src/tmdb';
import { getUserPreferences } from '../../src/userPreferences';
import {
  Conversation, listConversations, saveConversation, deleteConversation,
  titleFromFirstMessage, getUserMemory, setUserMemory,
  getAiName, setAiName as persistAiName,
} from '../../src/chatStorage';
import ChatHistorySidebar from '../../src/components/aichat/ChatHistorySidebar';
import FormattedMarkdownText from '../../src/components/aichat/FormattedMarkdownText';
import AiComparisonTable from '../../src/components/aichat/AiComparisonTable';
import AiStructuredList from '../../src/components/aichat/AiStructuredList';

const { width, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

type Movie = {
  id: string | number;
  title: string;
  name?: string;
  poster_path?: string;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
};

type Actor = {
  id: string | number;
  name: string;
  profile_path?: string;
  known_for?: string;
};

type ChatMessage =
  | { id: string; role: 'user'; kind: 'text'; text: string }
  | { id: string; role: 'bot'; kind: 'text'; text: string }
  | { id: string; role: 'bot'; kind: 'typing' }
  | { id: string; role: 'bot'; kind: 'movies'; text?: string; movies: Movie[] }
  | { id: string; role: 'bot'; kind: 'actors'; text?: string; actors: Actor[] }
  | { id: string; role: 'bot'; kind: 'movie_detail'; text?: string; movie: Movie }
  | { id: string; role: 'bot'; kind: 'table'; title?: string; text?: string; headers: string[]; rows: (string | number)[][] }
  | { id: string; role: 'bot'; kind: 'list'; title?: string; text?: string; items: any[]; ordered?: boolean }
  | { id: string; role: 'bot'; kind: 'error'; text: string };

const STARTER_PROMPTS = [
  { emoji: '⚖️', label: 'Compare Oppenheimer vs Interstellar' },
  { emoji: '📊', label: 'Top 5 highest grossing movies of all time' },
  { emoji: '🤯', label: 'Mind-bending thriller' },
  { emoji: '🚀', label: 'Stunning sci-fi' },
  { emoji: '🎭', label: 'Emotional drama' },
  { emoji: '🎲', label: 'Surprise me' },
];

const AI_NAME_SUGGESTIONS = ['Cine', 'Nova', 'Reel', 'Scout', 'Pixel', 'Movi'];

const ACCENT = '#FF3B3B';
const ACCENT_GLOW = 'rgba(255, 59, 59, 0.35)';
const GLASS_BG = 'rgba(255, 255, 255, 0.04)';
const GLASS_BORDER = 'rgba(255, 255, 255, 0.08)';

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// ────────────────────────────────────────────────────────────────
// AI Name Setup (Onboarding)
// ────────────────────────────────────────────────────────────────

const AiNameSetup = ({ onComplete }: { onComplete: (name: string) => void }) => {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const glowAnim = useSharedValue(0);
  const orbAnim1 = useSharedValue(0);
  const orbAnim2 = useSharedValue(0);

  useEffect(() => {
    glowAnim.value = withRepeat(withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }), -1, true);
    orbAnim1.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.ease) }), -1, true);
    orbAnim2.value = withRepeat(withTiming(1, { duration: 4500, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + glowAnim.value * 0.4,
    transform: [{ scale: 1 + glowAnim.value * 0.15 }],
  }));

  const orb1Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: -60 + orbAnim1.value * 120 },
      { translateY: -30 + orbAnim1.value * 60 },
    ],
    opacity: 0.15 + orbAnim1.value * 0.15,
  }));

  const orb2Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: 50 - orbAnim2.value * 100 },
      { translateY: 40 - orbAnim2.value * 80 },
    ],
    opacity: 0.1 + orbAnim2.value * 0.2,
  }));

  const handleSubmit = () => {
    const finalName = name.trim() || 'Cine';
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onComplete(finalName);
  };

  return (
    <View style={[setupStyles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <LinearGradient colors={['#0A0A0F', '#0D0512', '#050208']} style={StyleSheet.absoluteFill} />

      {/* Floating orbs */}
      <Animated.View style={[setupStyles.orb, setupStyles.orb1, orb1Style]} />
      <Animated.View style={[setupStyles.orb, setupStyles.orb2, orb2Style]} />

      <View style={setupStyles.content}>
        {/* Glowing icon */}
        <Animated.View style={[setupStyles.iconContainer, glowStyle]}>
          <LinearGradient
            colors={['rgba(255,59,59,0.25)', 'rgba(255,59,59,0.05)']}
            style={setupStyles.iconGlow}
          />
        </Animated.View>
        <Animated.View entering={ZoomIn.springify().delay(200)} style={setupStyles.iconInner}>
          <MaterialCommunityIcons name="robot-happy-outline" size={48} color={ACCENT} />
        </Animated.View>

        <Animated.Text entering={FadeInUp.delay(400).springify()} style={setupStyles.title}>
          Name your{'\n'}Movie Assistant
        </Animated.Text>
        <Animated.Text entering={FadeInUp.delay(550).springify()} style={setupStyles.subtitle}>
          Give me a name and I'll be your personal movie guide
        </Animated.Text>

        {/* Name input */}
        <Animated.View entering={FadeInUp.delay(700).springify()} style={setupStyles.inputContainer}>
          <LinearGradient
            colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']}
            style={setupStyles.inputGradient}
          >
            <TextInput
              style={setupStyles.input}
              placeholder="Type a name..."
              placeholderTextColor="#555"
              value={name}
              onChangeText={setName}
              maxLength={16}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </LinearGradient>
        </Animated.View>

        {/* Suggestions */}
        <Animated.View entering={FadeInUp.delay(900).springify()} style={setupStyles.suggestionsRow}>
          {AI_NAME_SUGGESTIONS.map((sug, i) => (
            <TouchableOpacity activeOpacity={0.95}
              key={sug}
              style={[setupStyles.suggestionChip, name === sug && setupStyles.suggestionChipActive]}
              onPress={() => { Haptics.selectionAsync(); setName(sug); }}
            >
              <Text style={[setupStyles.suggestionText, name === sug && { color: 'white' }]}>{sug}</Text>
            </TouchableOpacity>
          ))}
        </Animated.View>

        {/* Continue button */}
        <Animated.View entering={FadeInUp.delay(1100).springify()}>
          <TouchableOpacity
            style={[setupStyles.continueBtn, !name.trim() && { opacity: 0.5 }]}
            onPress={handleSubmit}
            activeOpacity={0.95}
          >
            <LinearGradient
              colors={[ACCENT, '#CC2020']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={setupStyles.continueBtnGradient}
            >
              <Text style={setupStyles.continueBtnText}>Let's Go</Text>
              <Ionicons name="arrow-forward" size={18} color="white" />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
};

// ────────────────────────────────────────────────────────────────
// Animated Typing Indicator
// ────────────────────────────────────────────────────────────────

const GlowingTypingDots = () => {
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);
  const haloGlow = useSharedValue(0);

  useEffect(() => {
    dot1.value = withRepeat(withSequence(
      withTiming(1, { duration: 400 }), withTiming(0, { duration: 400 })
    ), -1);
    dot2.value = withDelay(150, withRepeat(withSequence(
      withTiming(1, { duration: 400 }), withTiming(0, { duration: 400 })
    ), -1));
    dot3.value = withDelay(300, withRepeat(withSequence(
      withTiming(1, { duration: 400 }), withTiming(0, { duration: 400 })
    ), -1));
    haloGlow.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, []);

  const dot1Style = useAnimatedStyle(() => ({
    transform: [{ translateY: -dot1.value * 6 }, { scale: 0.9 + dot1.value * 0.3 }],
    backgroundColor: interpolateColor(dot1.value, [0, 1], ['#555', ACCENT]),
    shadowColor: ACCENT,
    shadowOpacity: dot1.value * 0.8,
    shadowRadius: 6,
  }));

  const dot2Style = useAnimatedStyle(() => ({
    transform: [{ translateY: -dot2.value * 6 }, { scale: 0.9 + dot2.value * 0.3 }],
    backgroundColor: interpolateColor(dot2.value, [0, 1], ['#555', ACCENT]),
    shadowColor: ACCENT,
    shadowOpacity: dot2.value * 0.8,
    shadowRadius: 6,
  }));

  const dot3Style = useAnimatedStyle(() => ({
    transform: [{ translateY: -dot3.value * 6 }, { scale: 0.9 + dot3.value * 0.3 }],
    backgroundColor: interpolateColor(dot3.value, [0, 1], ['#555', ACCENT]),
    shadowColor: ACCENT,
    shadowOpacity: dot3.value * 0.8,
    shadowRadius: 6,
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.1 + haloGlow.value * 0.15,
    transform: [{ scale: 1 + haloGlow.value * 0.1 }],
  }));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
      <Animated.View style={[styles.typingDot, dot1Style]} />
      <Animated.View style={[styles.typingDot, dot2Style]} />
      <Animated.View style={[styles.typingDot, dot3Style]} />
    </View>
  );
};

// ────────────────────────────────────────────────────────────────
// Pulsing header glow
// ────────────────────────────────────────────────────────────────

const HeaderGlowBar = () => {
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + glow.value * 0.5,
  }));

  return (
    <Animated.View style={[{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1 }, glowStyle]}>
      <LinearGradient
        colors={['transparent', ACCENT_GLOW, ACCENT, ACCENT_GLOW, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
};

// ────────────────────────────────────────────────────────────────
// Main Chat Screen
// ────────────────────────────────────────────────────────────────

const AiChat = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);

  // State
  const [aiName, setAiNameState] = useState<string | null>(null); // null = loading, '' = needs setup
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string>(uid());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMemory, setUserMemoryState] = useState('');
  const [watchedIds, setWatchedIds] = useState<Set<number>>(new Set());
  const [watchedTitles, setWatchedTitles] = useState<string[]>([]);
  const [watchlistTitles, setWatchlistTitles] = useState<string[]>([]);
  const [watchlistCollections, setWatchlistCollections] = useState<string[]>([]);
  const [userPrefs, setUserPrefs] = useState<any>(null);
  const [inputFocused, setInputFocused] = useState(false);

  // Animations
  const inputGlow = useSharedValue(0);
  const sendBtnScale = useSharedValue(1);

  const edgePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return (
          !sidebarOpen &&
          evt.nativeEvent.pageX < 45 &&
          gestureState.dx > 20 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
        );
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 35) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setSidebarOpen(true);
        }
      },
    })
  ).current;

  const inputGlowStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(inputGlow.value, [0, 1], ['rgba(255,255,255,0.08)', 'rgba(255,59,59,0.4)']),
    shadowOpacity: inputGlow.value * 0.3,
    shadowColor: ACCENT,
    shadowRadius: 12,
  }));

  const sendBtnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sendBtnScale.value }],
  }));

  useEffect(() => {
    inputGlow.value = withTiming(inputFocused ? 1 : 0, { duration: 300 });
  }, [inputFocused]);

  const makeGreeting = (name: string, memory: string): ChatMessage => ({
    id: uid(),
    role: 'bot',
    kind: 'text',
    text: memory
      ? `Lights, camera, action. I'm ${name} 🎬 Last time I noticed you're into ${memory.slice(0, 60)}... Ready to find your next obsession?`
      : `Lights, camera, action. I'm ${name} 🎬\n\nThrow me a vibe, a genre, an actor, or just say "surprise me" — I'll find something worth watching.`,
  });

  // ── Load everything on mount ────────────────────────────────
  useEffect(() => {
    (async () => {
      const [name, mem, convos, prefs] = await Promise.all([
        getAiName(),
        getUserMemory(),
        listConversations(),
        getUserPreferences(),
      ]);

      setUserMemoryState(mem);
      setConversations(convos);
      setUserPrefs(prefs);

      // Load watched history
      try {
        const watched = getSavedItems('history');
        setWatchedIds(new Set(watched.map((i: any) => i.id)));
        setWatchedTitles(watched.map((i: any) => i.title || i.name || '').filter(Boolean));
      } catch {}

      // Load watchlist (saved movies/TV and collections the user wants to watch)
      try {
        const wl = getSavedItems('watchlist');
        const collections = wl.filter((i: any) => i.media_type === 'collection');
        const movies = wl.filter((i: any) => i.media_type !== 'collection');
        setWatchlistTitles(movies.map((i: any) => i.title || i.name || '').filter(Boolean));
        setWatchlistCollections(collections.map((i: any) => i.name || i.title || '').filter(Boolean));
      } catch {}

      if (name) {
        setAiNameState(name);
        setMessages([makeGreeting(name, mem)]);
      } else {
        setAiNameState(''); // trigger setup screen
      }
    })();
  }, []);

  // ── Persist conversations ───────────────────────────────────
  useEffect(() => {
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

  // ── Actions ─────────────────────────────────────────────────

  const handleNameSetup = async (name: string) => {
    await persistAiName(name);
    setAiNameState(name);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMessages([makeGreeting(name, userMemory)]);
  };

  const startNewChat = () => {
    setConversationId(uid());
    setMessages([makeGreeting(aiName || 'Cine', userMemory)]);
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput('');
    setSending(true);

    // Send button bounce
    sendBtnScale.value = withSequence(
      withSpring(0.85, { damping: 4 }),
      withSpring(1, { damping: 6 })
    );

    pushMessage({ id: uid(), role: 'user', kind: 'text', text });
    const typingId = uid();
    pushMessage({ id: typingId, role: 'bot', kind: 'typing' });

    try {
      const reply = await fetchChatGemini(text, messages, userMemory, watchedTitles, watchlistTitles, watchlistCollections, userPrefs);

      setMessages((prev) => {
        const withoutTyping = prev.filter((m) => m.id !== typingId);
        return [...withoutTyping, { id: uid(), ...reply } as ChatMessage];
      });
      scrollToEnd();

      // Assuming updateUserMemory is imported elsewhere as per requirements
      // updateUserMemory(userMemory, text).then((updated) => { ... });
    } catch (e) {
      console.error('getGeminiChatReply failed:', e);
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
  }, [input, sending, messages, userMemory, watchedTitles]);

  const openMovie = async (item: Movie) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const full = await getFullDetails(item);
    navigateToDetails(full);
  };

  const navigateToDetails = (full: any) => {
    Keyboard.dismiss();
    const mType = full.media_type || (full.first_air_date ? 'tv' : 'movie');
    router.push(`/movie/${full.id}?media_type=${mType}`);
  };

  const navigateToCastDetails = (actor: any) => {
    Keyboard.dismiss();
    router.push(`/cast/${actor.id}`);
  };

  const isMovieWatched = (item?: Movie | null) => {
    if (!item?.id) return false;
    return watchedIds.has(Number(item.id));
  };

  // ── Renderers ───────────────────────────────────────────────

  const renderTextBubble = (m: Extract<ChatMessage, { kind: 'text' }>, index: number) => (
    <View>
      {m.role === 'user' ? (
        <LinearGradient
          colors={[ACCENT, '#CC2020']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.bubble, styles.bubbleUser]}
        >
          <FormattedMarkdownText
            text={m.text}
            style={styles.bubbleUserText}
            baseColor="#FFFFFF"
            boldColor="#FFFFFF"
          />
        </LinearGradient>
      ) : (
        <View style={[styles.bubble, styles.bubbleBot]}>
          <FormattedMarkdownText
            text={m.text}
            style={styles.bubbleBotText}
            baseColor="#E0E0E0"
            boldColor="#FFFFFF"
          />
        </View>
      )}
    </View>
  );

  const renderError = (m: Extract<ChatMessage, { kind: 'error' }>) => (
    <View>
      <View style={[styles.bubble, styles.bubbleError]}>
        <Ionicons name="alert-circle-outline" size={16} color="#FF6B6B" />
        <Text style={styles.bubbleErrorText}>{m.text}</Text>
      </View>
    </View>
  );

  const renderTyping = () => (
    <View>
      <View style={[styles.bubble, styles.bubbleBot, { flexDirection: 'row', gap: 4, paddingVertical: 14 }]}>
        <GlowingTypingDots />
      </View>
    </View>
  );

  const renderMovieList = (m: Extract<ChatMessage, { kind: 'movies' }>) => {
    const validMovies = (m.movies || []).filter((item): item is Movie => !!item && !!item.id);
    return (
      <View style={{ marginBottom: 4 }}>
        {!!m.text && (
          <View style={[styles.bubble, styles.bubbleBot]}>
            <FormattedMarkdownText
              text={m.text}
              style={styles.bubbleBotText}
              baseColor="#E0E0E0"
              boldColor="#FFFFFF"
            />
          </View>
        )}
        {validMovies.length > 0 && (
          <View style={{ paddingHorizontal: 16, gap: 12, paddingVertical: 8 }}>
            {validMovies.map((item) => {
              const watched = isMovieWatched(item);
              return (
                <TouchableOpacity key={String(item.id)} activeOpacity={0.95} style={styles.detailCard} onPress={() => openMovie(item)}>
                  <Image
                    source={{ uri: getImageUrl(item.poster_path, 'w92') }}
                    style={styles.detailGlow}
                    blurRadius={30}
                  />
                  <LinearGradient
                    colors={['rgba(20,20,20,0.85)', 'rgba(20,20,20,0.95)']}
                    style={styles.detailInner}
                  >
                    <Image source={{ uri: getImageUrl(item.poster_path, 'w185') }} style={styles.detailPoster} />
                    <View style={styles.detailContent}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 24 }}>
                        <Text style={styles.detailTitle} numberOfLines={2}>{item.title || item.name}</Text>
                        {watched && (
                          <View style={[styles.watchedBadge, { position: 'relative', top: 0, right: 0 }]}>
                            <Ionicons name="checkmark-circle" size={11} color="#4ADE80" />
                            <Text style={styles.watchedBadgeText}>Watched</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.tagsRow}>
                        <View style={styles.tag}>
                          <Ionicons name="star" color="#FFD700" size={10} />
                          <Text style={styles.tagText}>{item.vote_average?.toFixed(1) ?? '–'}</Text>
                        </View>
                        <View style={[styles.tag, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                          <Text style={[styles.tagText, { color: '#AAA' }]}>
                            {(item.release_date || item.first_air_date)?.split('-')[0] || 'N/A'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.detailOverview} numberOfLines={3}>{item.overview}</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const renderActorList = (m: Extract<ChatMessage, { kind: 'actors' }>) => {
    const validActors = (m.actors || []).filter((item): item is Actor => !!item && !!item.id);
    return (
      <View style={{ marginBottom: 4 }}>
        {!!m.text && (
          <View style={[styles.bubble, styles.bubbleBot]}>
            <FormattedMarkdownText
              text={m.text}
              style={styles.bubbleBotText}
              baseColor="#E0E0E0"
              boldColor="#FFFFFF"
            />
          </View>
        )}
        {validActors.length > 0 && (
          <FlatList
            horizontal
            data={validActors}
            keyExtractor={(item) => String(item.id)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 16, paddingVertical: 8 }}
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInUp.delay(index * 80).springify()}>
                <TouchableOpacity activeOpacity={0.95} style={styles.actorCard} onPress={() => navigateToCastDetails(item)}>
                  <View style={styles.actorAvatarContainer}>
                    <Image source={{ uri: getImageUrl(item.profile_path, 'w185') }} style={styles.actorAvatar} />
                    <LinearGradient
                      colors={['transparent', 'rgba(255,59,59,0.15)']}
                      style={styles.actorAvatarGlow}
                    />
                  </View>
                  <Text numberOfLines={1} style={styles.actorName}>{item.name}</Text>
                  {!!item.known_for && <Text numberOfLines={1} style={styles.actorKnownFor}>{item.known_for}</Text>}
                </TouchableOpacity>
              </Animated.View>
            )}
          />
        )}
      </View>
    );
  };

  const renderMovieDetail = (m: Extract<ChatMessage, { kind: 'movie_detail' }>) => {
    if (!m.movie || !m.movie.id) {
      return (
        <View style={{ marginBottom: 4 }}>
          {!!m.text && (
            <View style={[styles.bubble, styles.bubbleBot]}>
              <FormattedMarkdownText
                text={m.text}
                style={styles.bubbleBotText}
                baseColor="#E0E0E0"
                boldColor="#FFFFFF"
              />
            </View>
          )}
        </View>
      );
    }
    const watched = isMovieWatched(m.movie);
    return (
      <View style={{ marginBottom: 4 }}>
        {!!m.text && (
          <View style={[styles.bubble, styles.bubbleBot]}>
            <FormattedMarkdownText
              text={m.text}
              style={styles.bubbleBotText}
              baseColor="#E0E0E0"
              boldColor="#FFFFFF"
            />
          </View>
        )}
        <TouchableOpacity activeOpacity={0.95} style={styles.detailCard} onPress={() => openMovie(m.movie)}>
          <Image
            source={{ uri: getImageUrl(m.movie.poster_path, 'w92') }}
            style={styles.detailGlow}
            blurRadius={30}
          />
          <LinearGradient
            colors={['rgba(20,20,20,0.85)', 'rgba(20,20,20,0.95)']}
            style={styles.detailInner}
          >
            <Image source={{ uri: getImageUrl(m.movie.poster_path, 'w185') }} style={styles.detailPoster} />
            <View style={styles.detailContent}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.detailTitle} numberOfLines={2}>{m.movie.title || m.movie.name}</Text>
                {watched && (
                  <View style={[styles.watchedBadge, { position: 'relative', top: 0, right: 0 }]}>
                    <Ionicons name="checkmark-circle" size={11} color="#4ADE80" />
                    <Text style={styles.watchedBadgeText}>Watched</Text>
                  </View>
                )}
              </View>
              <View style={styles.tagsRow}>
                <View style={styles.tag}>
                  <Ionicons name="star" color="#FFD700" size={10} />
                  <Text style={styles.tagText}>{m.movie.vote_average?.toFixed(1) ?? '–'}</Text>
                </View>
                <View style={[styles.tag, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                  <Text style={[styles.tagText, { color: '#AAA' }]}>
                    {(m.movie.release_date || m.movie.first_air_date)?.split('-')[0] || 'N/A'}
                  </Text>
                </View>
              </View>
              <Text style={styles.detailOverview} numberOfLines={4}>{m.movie.overview}</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  const renderTable = (m: Extract<ChatMessage, { kind: 'table' }>) => (
    <AiComparisonTable
      title={m.title}
      text={m.text}
      headers={m.headers}
      rows={m.rows}
    />
  );

  const renderList = (m: Extract<ChatMessage, { kind: 'list' }>) => (
    <AiStructuredList
      title={m.title}
      text={m.text}
      items={m.items}
      ordered={m.ordered ?? true}
    />
  );

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    switch (item.kind) {
      case 'text': return renderTextBubble(item, index);
      case 'typing': return renderTyping();
      case 'movies': return renderMovieList(item);
      case 'actors': return renderActorList(item);
      case 'movie_detail': return renderMovieDetail(item);
      case 'table': return renderTable(item);
      case 'list': return renderList(item);
      case 'error': return renderError(item);
      default: return null;
    }
  };

  // ── Loading state ───────────────────────────────────────────
  if (aiName === null) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  // ── Name setup screen ───────────────────────────────────────
  if (aiName === '') {
    return <AiNameSetup onComplete={handleNameSetup} />;
  }



  // ── Main chat ───────────────────────────────────────────────
  const showStarterChips = messages.length === 1;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      {...edgePanResponder.panHandlers}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <LinearGradient colors={['#0A0A0F', '#050208', '#000']} style={StyleSheet.absoluteFill} />

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity activeOpacity={0.95} onPress={() => { Haptics.selectionAsync(); setSidebarOpen(true); }} hitSlop={10}>
          <Ionicons name="menu" size={22} color="white" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <View style={styles.headerDot} />
          <Text style={styles.headerTitle}>{aiName}</Text>
        </View>

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          activeOpacity={0.95}
          onPress={() => {
            Haptics.selectionAsync();
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push('/(tabs)');
            }
          }}
          hitSlop={10}
        >
          <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.95}
          onPress={() => { Haptics.selectionAsync(); startNewChat(); }}
          hitSlop={10}
          style={{ marginLeft: 14 }}
        >
          <Ionicons name="create-outline" size={20} color="white" />
        </TouchableOpacity>

        <HeaderGlowBar />
      </View>

      {/* ── Sidebar ── */}
      <ChatHistorySidebar
        visible={sidebarOpen}
        conversations={conversations}
        activeId={conversationId}
        onClose={() => setSidebarOpen(false)}
        onSelect={openConversation}
        onNewChat={startNewChat}
        onDelete={removeConversation}
      />

      {/* ── Messages ── */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        contentContainerStyle={{ paddingVertical: 12, paddingBottom: showStarterChips ? 8 : 24 }}
        onContentSizeChange={scrollToEnd}
        showsVerticalScrollIndicator={false}
      />

      {/* ── Starter Chips ── */}
      {showStarterChips && (
        <Animated.View entering={FadeIn.delay(300)} style={styles.chipsContainer}>
          {STARTER_PROMPTS.map((p, i) => (
            <Animated.View key={p.label} entering={FadeInUp.delay(400 + i * 80).springify()}>
              <TouchableOpacity activeOpacity={0.95}
                style={styles.chip}
                onPress={() => { Haptics.selectionAsync(); handleSend(`${p.emoji} ${p.label}`); }}
                activeOpacity={0.95}
              >
                <Text style={styles.chipEmoji}>{p.emoji}</Text>
                <Text style={styles.chipText}>{p.label}</Text>
              </TouchableOpacity>
            </Animated.View>
          ))}
        </Animated.View>
      )}

      {/* ── Input Bar ── */}
      <Animated.View style={[styles.inputBar, { paddingBottom: insets.bottom + 12 }]}>
        <Animated.View style={[styles.inputWrapper, inputGlowStyle]}>
          <TextInput
            style={styles.input}
            placeholder={`Ask ${aiName} anything...`}
            placeholderTextColor="#555"
            value={input}
            onChangeText={setInput}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onSubmitEditing={() => handleSend()}
            returnKeyType="send"
            editable={!sending}
            multiline={false}
          />
        </Animated.View>

        <Animated.View style={sendBtnAnimStyle}>
          <TouchableOpacity activeOpacity={0.95}
            style={[styles.sendBtn, (!input.trim() || sending) && { opacity: 0.35 }]}
            onPress={() => handleSend()}
            disabled={!input.trim() || sending}
            activeOpacity={0.95}
          >
            <LinearGradient
              colors={[ACCENT, '#CC2020']}
              style={styles.sendBtnGradient}
            >
              {sending
                ? <ActivityIndicator size="small" color="white" />
                : <Ionicons name="arrow-up" size={20} color="white" />}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
};

export default AiChat;

// ────────────────────────────────────────────────────────────────
// Setup Styles
// ────────────────────────────────────────────────────────────────

const setupStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  orb: { position: 'absolute', borderRadius: 200 },
  orb1: {
    width: 260, height: 260, backgroundColor: 'rgba(255, 59, 59, 0.12)',
    top: '20%', left: '10%',
  },
  orb2: {
    width: 200, height: 200, backgroundColor: 'rgba(120, 40, 200, 0.1)',
    bottom: '25%', right: '5%',
  },
  iconContainer: { position: 'absolute', width: 120, height: 120, borderRadius: 60 },
  iconGlow: { width: '100%', height: '100%', borderRadius: 60 },
  iconInner: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(255,59,59,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,59,59,0.2)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    color: 'white', fontSize: 30, fontWeight: '800', textAlign: 'center',
    lineHeight: 38, marginBottom: 10,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.45)', fontSize: 15, textAlign: 'center',
    lineHeight: 22, marginBottom: 36,
  },
  inputContainer: { width: '100%', marginBottom: 20 },
  inputGradient: {
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  input: {
    color: 'white', fontSize: 18, fontWeight: '600',
    paddingHorizontal: 20, paddingVertical: 16, textAlign: 'center',
  },
  suggestionsRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 10, marginBottom: 40,
  },
  suggestionChip: {
    paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  suggestionChipActive: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(255,59,59,0.12)',
  },
  suggestionText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '500' },
  continueBtn: { minWidth: 180 },
  continueBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15, paddingHorizontal: 32,
    borderRadius: 25,
  },
  continueBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
});

// ────────────────────────────────────────────────────────────────
// Chat Styles
// ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14,
  },
  headerCenter: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  headerDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT,
    shadowColor: ACCENT, shadowOpacity: 0.8, shadowRadius: 6, elevation: 4,
  },
  headerTitle: {
    color: 'white', fontSize: 17, fontWeight: '700', letterSpacing: 0.3,
  },

  // Bubbles
  bubble: {
    maxWidth: width * 0.82, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12,
    marginHorizontal: 16, marginVertical: 3,
  },
  bubbleUser: {
    alignSelf: 'flex-end', borderBottomRightRadius: 6,
    shadowColor: ACCENT, shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  bubbleBot: {
    alignSelf: 'flex-start', borderBottomLeftRadius: 6,
    backgroundColor: GLASS_BG,
    borderWidth: 1, borderColor: GLASS_BORDER,
  },
  bubbleUserText: { color: 'white', fontSize: 15, lineHeight: 21, fontWeight: '500' },
  bubbleBotText: { color: '#E8E8E8', fontSize: 15, lineHeight: 22 },
  bubbleError: {
    backgroundColor: 'rgba(255,59,59,0.08)', alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(255,59,59,0.15)',
  },
  bubbleErrorText: { color: '#FF9B9B', fontSize: 13 },

  typingDot: {
    width: 7, height: 7, borderRadius: 3.5,
  },

  // Movie carousel
  movieCard: { width: 125, position: 'relative' },
  moviePosterGlow: {
    position: 'absolute', top: 4, left: 4, right: 4, bottom: 40,
    borderRadius: 12, overflow: 'hidden', opacity: 0.5,
  },
  moviePoster: {
    width: 125, height: 178, borderRadius: 12, backgroundColor: '#111',
  },
  watchedBadge: {
    position: 'absolute', top: 8, right: 6,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)',
  },
  watchedBadgeText: { color: '#4ADE80', fontSize: 9, fontWeight: '700' },
  movieMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8 },
  movieRating: { color: '#DDD', fontSize: 11, fontWeight: '700' },
  movieTitle: { color: 'white', fontSize: 13, fontWeight: '600', marginTop: 3 },
  movieYear: { color: '#666', fontSize: 11, marginTop: 2 },

  // Actor carousel
  actorCard: { width: 90, alignItems: 'center' },
  actorAvatarContainer: { position: 'relative', marginBottom: 6 },
  actorAvatar: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: '#111',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
  },
  actorAvatarGlow: {
    position: 'absolute', bottom: -4, left: -4, right: -4, height: 40,
    borderRadius: 38,
  },
  actorName: { color: 'white', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  actorKnownFor: { color: '#666', fontSize: 10, textAlign: 'center', marginTop: 2 },

  // Detail card
  detailCard: {
    height: 150, borderRadius: 14, backgroundColor: '#111',
    overflow: 'hidden', marginHorizontal: 16,
    borderWidth: 1, borderColor: GLASS_BORDER,
  },
  detailGlow: { position: 'absolute', width: '100%', height: '100%', opacity: 0.25 },
  detailInner: { flexDirection: 'row', flex: 1 },
  detailPoster: { width: 100, height: '100%' },
  detailContent: { flex: 1, padding: 12, justifyContent: 'center' },
  detailTitle: { color: 'white', fontSize: 16, fontWeight: 'bold', marginBottom: 6, flex: 1 },
  tagsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  tagText: { color: '#DDD', fontSize: 11, fontWeight: '700' },
  detailOverview: { color: '#777', fontSize: 12, lineHeight: 17 },

  // Starter chips
  chipsContainer: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16, paddingBottom: 12,
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: GLASS_BG,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 22, borderWidth: 1, borderColor: GLASS_BORDER,
  },
  chipEmoji: { fontSize: 15 },
  chipText: { color: 'rgba(255,255,255,0.6)', fontSize: 12.5, fontWeight: '500' },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingTop: 10,
  },
  inputWrapper: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.04)',
    height: 48, borderRadius: 24,
    borderWidth: 1, justifyContent: 'center',
  },
  input: { color: 'white', paddingHorizontal: 18, fontSize: 15 },
  sendBtn: {},
  sendBtnGradient: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
});
