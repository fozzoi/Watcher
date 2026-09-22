import React, { memo, useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  Image, ActivityIndicator, StyleSheet, StatusBar, Keyboard,
  KeyboardAvoidingView, Platform, PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInUp, FadeIn, ZoomIn,
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withSequence, withDelay, Easing, interpolateColor,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { getSavedItems, getAllAiEmbeddings } from '../../src/database';

import { getImageUrl, getFullDetails, fetchChatGemini, fetchEmbedding } from '../../src/tmdb';
import { getUserPreferences } from '../../src/userPreferences';
import {
  Conversation, listConversations, saveConversation, deleteConversation,
  titleFromFirstMessage, getUserMemory,
  getAiName, setAiName as persistAiName,
} from '../../src/chatStorage';
import ChatHistorySidebar from '../../src/components/aichat/ChatHistorySidebar';
import FormattedMarkdownText from '../../src/components/aichat/FormattedMarkdownText';
import AiComparisonTable from '../../src/components/aichat/AiComparisonTable';
import AiStructuredList from '../../src/components/aichat/AiStructuredList';
import { parseAiReply } from '../../src/components/aichat/parseAiReply';
import { ai } from '../../src/components/aichat/aiTheme';

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
  | { id: string; role: 'bot'; kind: 'error'; text: string; retryText?: string };

const STARTER_PROMPTS = [
  'Compare Oppenheimer vs Interstellar',
  'Top 5 highest grossing movies of all time',
  'A mind-bending thriller',
  'Stunning sci-fi',
  'An emotional drama',
  'Surprise me',
];

const AI_NAME_SUGGESTIONS = ['Cine', 'Nova', 'Reel', 'Scout', 'Pixel', 'Movi'];

const ACCENT = ai.accent;

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const cosineSimilarity = (a: number[], b: number[]) => {
  if (!a?.length || a.length !== b?.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

/** Never show raw JSON / escape sequences, even for old saved conversations. */
const displayText = (raw?: string) => {
  const t = (raw ?? '').trim();
  if (t.startsWith('{') || t.startsWith('```')) return parseAiReply(t).text;
  return t;
};

/** Turns whatever the API layer returned into a safe ChatMessage. */
const normalizeBotReply = (reply: any): ChatMessage => {
  const msg: any = { id: uid(), role: 'bot', ...reply };
  if (!msg.kind || msg.kind === 'text') {
    msg.kind = 'text';
    msg.text = displayText(msg.text);
  }
  return msg as ChatMessage;
};

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

      <Animated.View style={[setupStyles.orb, setupStyles.orb1, orb1Style]} />
      <Animated.View style={[setupStyles.orb, setupStyles.orb2, orb2Style]} />

      <View style={setupStyles.content}>
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

        <Animated.View entering={FadeInUp.delay(900).springify()} style={setupStyles.suggestionsRow}>
          {AI_NAME_SUGGESTIONS.map((sug) => (
            <TouchableOpacity
              activeOpacity={0.9}
              key={sug}
              style={[setupStyles.suggestionChip, name === sug && setupStyles.suggestionChipActive]}
              onPress={() => { Haptics.selectionAsync(); setName(sug); }}
            >
              <Text style={[setupStyles.suggestionText, name === sug && { color: 'white' }]}>{sug}</Text>
            </TouchableOpacity>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(1100).springify()}>
          <TouchableOpacity style={setupStyles.continueBtn} onPress={handleSubmit} activeOpacity={0.9}>
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
// Small building blocks
// ────────────────────────────────────────────────────────────────

const Dot = ({ delay }: { delay: number }) => {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: 380 }), withTiming(0, { duration: 380 })), -1)
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -v.value * 5 }],
    backgroundColor: interpolateColor(v.value, [0, 1], ['#555', ACCENT]),
  }));
  return <Animated.View style={[styles.typingDot, style]} />;
};

const TypingDots = () => (
  <View style={styles.typingRow}>
    <Dot delay={0} />
    <Dot delay={150} />
    <Dot delay={300} />
  </View>
);

const IconBtn = ({
  name, onPress, label, disabled, color = 'white',
}: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  label: string;
  disabled?: boolean;
  color?: string;
}) => (
  <TouchableOpacity
    activeOpacity={0.7}
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    style={[styles.iconBtn, disabled && { opacity: 0.35 }]}
  >
    <Ionicons name={name} size={21} color={color} />
  </TouchableOpacity>
);

const MovieCard = memo(({
  movie, watched, onPress, lines = 2,
}: { movie: Movie; watched: boolean; onPress: () => void; lines?: number }) => {
  const title = movie.title || movie.name || 'Untitled';
  const year = (movie.release_date || movie.first_air_date)?.split('-')[0];
  const rating = Number(movie.vote_average) > 0 ? Number(movie.vote_average).toFixed(1) : null;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.movieCard}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
    >
      {movie.poster_path ? (
        <Image source={{ uri: getImageUrl(movie.poster_path, 'w185') }} style={styles.poster} resizeMode="cover" />
      ) : (
        <View style={[styles.poster, styles.posterEmpty]}>
          <Ionicons name="film-outline" size={22} color={ai.textMute} />
        </View>
      )}

      <View style={styles.movieBody}>
        <Text style={styles.movieTitle} numberOfLines={2}>{title}</Text>
        <View style={styles.metaRow}>
          {rating && (
            <>
              <Ionicons name="star" size={11} color="#FFD700" />
              <Text style={styles.metaText}>{rating}</Text>
            </>
          )}
          {!!year && <Text style={styles.metaMuted}>{rating ? '·  ' : ''}{year}</Text>}
          {watched && (
            <View style={styles.watchedPill}>
              <Ionicons name="checkmark" size={10} color={ai.textDim} />
              <Text style={styles.watchedText}>Watched</Text>
            </View>
          )}
        </View>
        {!!movie.overview && (
          <Text style={styles.movieOverview} numberOfLines={lines}>{movie.overview}</Text>
        )}
      </View>

      <Ionicons name="chevron-forward" size={16} color={ai.textMute} />
    </TouchableOpacity>
  );
});

// ────────────────────────────────────────────────────────────────
// Main Chat Screen
// ────────────────────────────────────────────────────────────────

const AiChat = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMessage>>(null);

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
  const [showJump, setShowJump] = useState(false);

  // scroll bookkeeping
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const listHeight = useRef(0);
  const nearBottom = useRef(true);
  const pendingReplyId = useRef<string | null>(null);
  const openingRef = useRef(false);

  const edgePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, g) =>
        evt.nativeEvent.pageX < 45 && g.dx > 20 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx > 35) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setSidebarOpen(true);
        }
      },
    })
  ).current;

  // ── Scrolling ───────────────────────────────────────────────
  const scrollToEnd = useCallback((animated = true) => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
  }, []);

  // Long answers: land on the START of the reply. Short ones: stick to the bottom.
  const onItemLayout = useCallback((id: string, h: number) => {
    if (pendingReplyId.current !== id) return;
    pendingReplyId.current = null;
    const index = messagesRef.current.findIndex((m) => m.id === id);
    if (index >= 0 && h > listHeight.current * 0.65) {
      requestAnimationFrame(() =>
        listRef.current?.scrollToIndex({ index, viewPosition: 0, animated: true })
      );
    } else {
      scrollToEnd();
    }
  }, [scrollToEnd]);

  useEffect(() => {
    const evt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(evt, () => {
      if (nearBottom.current) scrollToEnd();
    });
    return () => sub.remove();
  }, [scrollToEnd]);

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

      try {
        const watched = getSavedItems('history');
        setWatchedIds(new Set(watched.map((i: any) => i.id)));
        setWatchedTitles(watched.map((i: any) => i.title || i.name || '').filter(Boolean));
      } catch {}

      try {
        const wl = getSavedItems('watchlist');
        const collections = wl.filter((i: any) => i.media_type === 'collection');
        const movies = wl.filter((i: any) => i.media_type !== 'collection');
        setWatchlistTitles(movies.map((i: any) => i.title || i.name || '').filter(Boolean));
        setWatchlistCollections(collections.map((i: any) => i.name || i.title || '').filter(Boolean));
      } catch {}

      setAiNameState(name || ''); // '' triggers the setup screen
    })();
  }, []);

  // Sync latest AI memory whenever this tab is focused (e.g. after clearing in Settings)
  useFocusEffect(
    useCallback(() => {
      getUserMemory().then(setUserMemoryState).catch(() => {});
    }, [])
  );

  // ── Persist conversations (never while typing / never empty) ─
  useEffect(() => {
    if (messages.length === 0 || messages.some((m) => m.kind === 'typing')) return;
    const convo: Conversation = {
      id: conversationId,
      title: titleFromFirstMessage(
        (messages.find((m) => m.role === 'user') as any)?.text ?? 'New chat'
      ),
      messages: messages as any,
      updatedAt: Date.now(),
    };
    saveConversation(convo)
      .then(() => listConversations().then(setConversations))
      .catch(() => {});
  }, [messages]);

  // ── Actions ─────────────────────────────────────────────────

  const handleNameSetup = async (name: string) => {
    await persistAiName(name);
    setAiNameState(name);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMessages([]);
  };

  const startNewChat = () => {
    setConversationId(uid());
    setMessages([]);
    setSidebarOpen(false);
  };

  const openConversation = (id: string) => {
    const convo = conversations.find((c) => c.id === id);
    if (!convo) return;
    setConversationId(convo.id);
    setMessages((convo.messages as ChatMessage[]).filter((m) => m.kind !== 'typing'));
    setSidebarOpen(false);
    setTimeout(() => scrollToEnd(false), 50);
  };

  const removeConversation = async (id: string) => {
    await deleteConversation(id);
    setConversations(await listConversations());
    if (id === conversationId) startNewChat();
  };

  const pushMessage = useCallback((m: ChatMessage) => {
    setMessages((prev) => [...prev, m]);
    nearBottom.current = true;
    scrollToEnd();
  }, [scrollToEnd]);

  const handleSend = useCallback(async (override?: string, isRetry = false) => {
    const text = (override ?? input).trim();
    if (!text || sending) return;

    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (override === undefined) setInput('');
    setSending(true);

    // history for the API: no typing/error rows, and on retry no duplicate of the failed question
    let history = messages.filter((m) => m.kind !== 'typing' && m.kind !== 'error');
    if (isRetry) {
      const last = history[history.length - 1];
      if (last && last.role === 'user' && (last as any).text === text) history = history.slice(0, -1);
    } else {
      pushMessage({ id: uid(), role: 'user', kind: 'text', text });
    }

    const typingId = uid();
    pushMessage({ id: typingId, role: 'bot', kind: 'typing' });

    try {
      // Rank the watchlist by similarity to this question. Optional: failures must never block the reply.
      let topWatchlistTitles = watchlistTitles;
      if (watchlistTitles.length > 0) {
        try {
          const userEmbedding = await fetchEmbedding(text);
          const all = userEmbedding ? getAllAiEmbeddings() : [];
          if (all.length > 0) {
            const topIds = new Set(
              all
                .map((item: any) => ({ mediaId: item.media_id, score: cosineSimilarity(userEmbedding, item.embedding) }))
                .sort((a: any, b: any) => b.score - a.score)
                .slice(0, 25)
                .map((s: any) => s.mediaId)
            );
            const picked = getSavedItems('watchlist')
              .filter((i: any) => topIds.has(i.id))
              .map((i: any) => i.title || i.name || '')
              .filter(Boolean);
            if (picked.length > 0) topWatchlistTitles = picked;
          }
        } catch (e) {
          console.warn('Watchlist ranking skipped:', e);
        }
      }

      const freshMemory = await getUserMemory();
      setUserMemoryState(freshMemory);

      const enrichedMemory = `${freshMemory}\n\n[System Note: The user has a total of ${watchlistTitles.length} movies/shows saved in their Watchlist, and ${watchedTitles.length} titles in their Watched history.]`;

      const reply = await fetchChatGemini(
        text, history, enrichedMemory, watchedTitles, topWatchlistTitles, watchlistCollections, userPrefs
      );

      const bot = normalizeBotReply(reply);
      pendingReplyId.current = bot.id;
      setMessages((prev) => [...prev.filter((m) => m.id !== typingId), bot]);

      // updateUserMemory(userMemory, text).then((updated) => { ... });
    } catch (e) {
      console.error('fetchChatGemini failed:', e);
      pendingReplyId.current = null;
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== typingId),
        { id: uid(), role: 'bot', kind: 'error', text: "Couldn't reach the AI.", retryText: text },
      ]);
      scrollToEnd();
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, userMemory, watchedTitles, watchlistTitles, watchlistCollections, userPrefs, pushMessage, scrollToEnd]);

  const navigateToDetails = (full: any) => {
    Keyboard.dismiss();
    const mType = full.media_type || (full.first_air_date ? 'tv' : 'movie');
    router.push(`/movie/${full.id}?media_type=${mType}`);
  };

  const openMovie = async (item: Movie) => {
    if (openingRef.current) return;
    openingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      navigateToDetails((await getFullDetails(item)) || item);
    } catch {
      navigateToDetails(item); // still open the page if enrichment fails
    } finally {
      openingRef.current = false;
    }
  };

  const navigateToCastDetails = (actor: Actor) => {
    Keyboard.dismiss();
    router.push(`/cast/${actor.id}`);
  };

  const isMovieWatched = (item?: Movie | null) => !!item?.id && watchedIds.has(Number(item.id));

  // ── Renderers ───────────────────────────────────────────────

  // plain function (not a component) so it doesn't remount on every render
  const botText = (text?: string) => {
    const t = displayText(text);
    if (!t) return null;
    return (
      <View style={styles.botRow}>
        <FormattedMarkdownText text={t} style={styles.botText} baseColor="#E8E8E8" boldColor="#FFFFFF" selectable />
      </View>
    );
  };

  const renderBody = (m: ChatMessage) => {
    switch (m.kind) {
      case 'text':
        if (m.role === 'user') {
          return (
            <View style={styles.userBubble}>
              <FormattedMarkdownText text={m.text} style={styles.userText} baseColor="#FFFFFF" boldColor="#FFFFFF" selectable />
            </View>
          );
        }
        return botText(m.text);

      case 'typing':
        return <View style={styles.botRow}><TypingDots /></View>;

      case 'movies': {
        const movies = (m.movies || []).filter((x): x is Movie => !!x && !!x.id);
        return (
          <View>
            {botText(m.text)}
            {movies.length > 0 && (
              <View style={styles.cardStack}>
                {movies.map((item) => (
                  <MovieCard key={String(item.id)} movie={item} watched={isMovieWatched(item)} onPress={() => openMovie(item)} />
                ))}
              </View>
            )}
          </View>
        );
      }

      case 'movie_detail':
        return (
          <View>
            {botText(m.text)}
            {!!m.movie?.id && (
              <View style={styles.cardStack}>
                <MovieCard movie={m.movie} watched={isMovieWatched(m.movie)} onPress={() => openMovie(m.movie)} lines={4} />
              </View>
            )}
          </View>
        );

      case 'actors': {
        const actors = (m.actors || []).filter((x): x is Actor => !!x && !!x.id);
        return (
          <View>
            {botText(m.text)}
            {actors.length > 0 && (
              <FlatList
                horizontal
                nestedScrollEnabled
                data={actors}
                keyExtractor={(a) => String(a.id)}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.actorRow}
                renderItem={({ item, index }) => (
                  <Animated.View entering={FadeInUp.delay(index * 70).springify()}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.actorCard}
                      onPress={() => navigateToCastDetails(item)}
                      accessibilityRole="button"
                      accessibilityLabel={item.name}
                    >
                      {item.profile_path ? (
                        <Image source={{ uri: getImageUrl(item.profile_path, 'w185') }} style={styles.actorAvatar} />
                      ) : (
                        <View style={[styles.actorAvatar, styles.posterEmpty]}>
                          <Ionicons name="person-outline" size={24} color={ai.textMute} />
                        </View>
                      )}
                      <Text numberOfLines={1} style={styles.actorName}>{item.name}</Text>
                      {!!item.known_for && <Text numberOfLines={1} style={styles.actorKnownFor}>{item.known_for}</Text>}
                    </TouchableOpacity>
                  </Animated.View>
                )}
              />
            )}
          </View>
        );
      }

      case 'table':
        return <AiComparisonTable title={m.title} text={m.text} headers={m.headers} rows={m.rows} />;

      case 'list':
        return <AiStructuredList title={m.title} text={m.text} items={m.items} ordered={m.ordered ?? true} />;

      case 'error':
        return (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle-outline" size={16} color={ai.accentText} />
            <Text style={styles.errorText}>{m.text}</Text>
            {!!m.retryText && (
              <TouchableOpacity
                activeOpacity={0.7}
                hitSlop={10}
                onPress={() => {
                  setMessages((prev) => prev.filter((x) => x.id !== m.id));
                  handleSend(m.retryText, true);
                }}
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            )}
          </View>
        );

      default:
        return null;
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View onLayout={(e) => onItemLayout(item.id, e.nativeEvent.layout.height)}>
      {renderBody(item)}
    </View>
  );

  // ── Loading / setup ─────────────────────────────────────────
  if (aiName === null) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  if (aiName === '') {
    return <AiNameSetup onComplete={handleNameSetup} />;
  }

  // ── Main chat ───────────────────────────────────────────────
  const isEmpty = messages.length === 0;
  const canSend = !!input.trim() && !sending;

  const hero = (
    <Animated.View entering={FadeIn.duration(350)} style={styles.hero}>
      <View style={styles.heroIcon}>
        <MaterialCommunityIcons name="movie-open-outline" size={26} color={ACCENT} />
      </View>
      <Text style={styles.heroTitle}>What do you want to watch?</Text>
      <Text style={styles.heroSub}>
        Ask {aiName} for picks, comparisons, or facts about any movie or show.
      </Text>
      <View style={styles.chips}>
        {STARTER_PROMPTS.map((label) => (
          <TouchableOpacity
            key={label}
            activeOpacity={0.8}
            style={styles.chip}
            onPress={() => { Haptics.selectionAsync(); handleSend(label); }}
          >
            <Text style={styles.chipText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );

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
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <IconBtn name="menu" label="Chat history" onPress={() => { Haptics.selectionAsync(); setSidebarOpen(true); }} />

        <View style={styles.headerTitleWrap}>
          <View style={styles.headerDot} />
          <Text style={styles.headerTitle} numberOfLines={1}>{aiName}</Text>
        </View>

        <View style={{ flex: 1 }} />

        <IconBtn
          name="create-outline"
          label="New chat"
          disabled={isEmpty}
          onPress={() => { Haptics.selectionAsync(); startNewChat(); }}
        />
        <IconBtn
          name="close"
          label="Close"
          color="rgba(255,255,255,0.6)"
          onPress={() => {
            Haptics.selectionAsync();
            if (router.canGoBack()) router.back();
            else router.push('/(tabs)');
          }}
        />
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

      {/* ── Messages ── */}
      <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          ListEmptyComponent={hero}
          contentContainerStyle={isEmpty ? { flexGrow: 1, justifyContent: 'center' } : { paddingVertical: 12, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onLayout={(e) => { listHeight.current = e.nativeEvent.layout.height; }}
          onScrollToIndexFailed={() => scrollToEnd()}
          scrollEventThrottle={64}
          onScroll={(e) => {
            const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
            const dist = contentSize.height - (contentOffset.y + layoutMeasurement.height);
            nearBottom.current = dist < 120;
            setShowJump(dist > 320);
          }}
        />

        {showJump && (
          <View style={styles.jumpWrap} pointerEvents="box-none">
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.jumpBtn}
              onPress={() => { nearBottom.current = true; scrollToEnd(); }}
              accessibilityRole="button"
              accessibilityLabel="Scroll to latest message"
            >
              <Ionicons name="chevron-down" size={18} color="white" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Input Bar ── */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 10 }]}>
        <View style={[styles.inputWrap, inputFocused && styles.inputWrapFocused]}>
          <TextInput
            style={styles.input}
            placeholder={`Ask ${aiName} anything...`}
            placeholderTextColor="#5A5A64"
            value={input}
            onChangeText={setInput}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            multiline
            maxLength={2000}
          />
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.sendBtn, canSend ? styles.sendBtnOn : styles.sendBtnOff]}
          onPress={() => handleSend()}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          {sending
            ? <ActivityIndicator size="small" color="white" />
            : <Ionicons name="arrow-up" size={20} color={canSend ? 'white' : ai.textMute} />}
        </TouchableOpacity>
      </View>
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
  orb1: { width: 260, height: 260, backgroundColor: 'rgba(255, 59, 59, 0.12)', top: '20%', left: '10%' },
  orb2: { width: 200, height: 200, backgroundColor: 'rgba(120, 40, 200, 0.1)', bottom: '25%', right: '5%' },
  iconContainer: { position: 'absolute', width: 120, height: 120, borderRadius: 60 },
  iconGlow: { width: '100%', height: '100%', borderRadius: 60 },
  iconInner: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(255,59,59,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,59,59,0.2)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 32,
  },
  title: { color: 'white', fontSize: 30, fontWeight: '800', textAlign: 'center', lineHeight: 38, marginBottom: 10 },
  subtitle: { color: 'rgba(255,255,255,0.45)', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 36 },
  inputContainer: { width: '100%', marginBottom: 20 },
  inputGradient: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  input: { color: 'white', fontSize: 18, fontWeight: '600', paddingHorizontal: 20, paddingVertical: 16, textAlign: 'center' },
  suggestionsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginBottom: 40 },
  suggestionChip: {
    paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.04)',
  },
  suggestionChipActive: { borderColor: ACCENT, backgroundColor: 'rgba(255,59,59,0.12)' },
  suggestionText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '500' },
  continueBtn: { minWidth: 180 },
  continueBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15, paddingHorizontal: 32, borderRadius: 25,
  },
  continueBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
});

// ────────────────────────────────────────────────────────────────
// Chat Styles
// ────────────────────────────────────────────────────────────────

const GUTTER = 16;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 4, flexShrink: 1 },
  headerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT },
  headerTitle: { color: 'white', fontSize: 17, fontWeight: '700' },

  // Messages
  userBubble: {
    alignSelf: 'flex-end', maxWidth: '84%',
    marginHorizontal: GUTTER, marginVertical: 6,
    backgroundColor: ACCENT,
    borderRadius: 18, borderBottomRightRadius: 6,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  userText: { color: 'white', fontSize: 15, lineHeight: 21, fontWeight: '500' },
  botRow: { marginHorizontal: GUTTER, marginVertical: 6 },
  botText: { color: '#E8E8E8', fontSize: 15, lineHeight: 22 },

  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  typingDot: { width: 7, height: 7, borderRadius: 3.5 },

  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: GUTTER, marginVertical: 6,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
    backgroundColor: ai.accentSoft, borderWidth: 1, borderColor: ai.accentLine,
    alignSelf: 'flex-start',
  },
  errorText: { color: '#FF9B9B', fontSize: 13 },
  retryText: { color: 'white', fontSize: 13, fontWeight: '700', marginLeft: 4 },

  // Movie cards
  cardStack: { gap: 10, marginTop: 6, marginBottom: 4 },
  movieCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: GUTTER, padding: 10, borderRadius: 14,
    backgroundColor: ai.card, borderWidth: 1, borderColor: ai.border,
  },
  poster: { width: 64, height: 96, borderRadius: 8, backgroundColor: '#1A1A20' },
  posterEmpty: { alignItems: 'center', justifyContent: 'center' },
  movieBody: { flex: 1, gap: 4 },
  movieTitle: { color: 'white', fontSize: 15, fontWeight: '700', lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  metaText: { color: '#DDD', fontSize: 12, fontWeight: '700' },
  metaMuted: { color: ai.textMute, fontSize: 12 },
  watchedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 6,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  watchedText: { color: ai.textDim, fontSize: 10, fontWeight: '600' },
  movieOverview: { color: ai.textMute, fontSize: 12.5, lineHeight: 17 },

  // Actors
  actorRow: { paddingHorizontal: GUTTER, gap: 16, paddingVertical: 8 },
  actorCard: { width: 84, alignItems: 'center' },
  actorAvatar: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: '#1A1A20',
    borderWidth: 1, borderColor: ai.border, marginBottom: 6,
  },
  actorName: { color: 'white', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  actorKnownFor: { color: ai.textMute, fontSize: 10.5, textAlign: 'center', marginTop: 2 },

  // Empty state
  hero: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 24 },
  heroIcon: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    backgroundColor: ai.accentSoft, borderWidth: 1, borderColor: ai.accentLine, marginBottom: 18,
  },
  heroTitle: { color: 'white', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  heroSub: { color: ai.textMute, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, maxWidth: 300 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 24 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: ai.border,
  },
  chipText: { color: ai.textDim, fontSize: 13, fontWeight: '500' },

  // Jump to latest
  jumpWrap: { position: 'absolute', left: 0, right: 0, bottom: 10, alignItems: 'center' },
  jumpBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1C1C22', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 14, paddingTop: 10,
  },
  inputWrap: {
    flex: 1, minHeight: 46, maxHeight: 128, borderRadius: 23, justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: ai.border,
  },
  inputWrapFocused: { borderColor: ai.accentLine },
  input: {
    color: 'white', fontSize: 15, maxHeight: 120,
    paddingHorizontal: 18, paddingTop: Platform.OS === 'ios' ? 13 : 9, paddingBottom: Platform.OS === 'ios' ? 13 : 9,
    textAlignVertical: 'center',
  },
  sendBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  sendBtnOn: { backgroundColor: ACCENT },
  sendBtnOff: { backgroundColor: 'rgba(255,255,255,0.08)' },
});