import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import FormattedMarkdownText from '../aichat/FormattedMarkdownText';
import { LANGUAGE_OPTIONS } from '../../userPreferences';

interface MovieChatSectionProps {
  movie: any;
  releaseYear?: string | number;
  directors: any[];
  genres: any[];
}

const C = {
  bg: '#0A0A0B',
  surface: '#141416',
  surface2: '#1C1C20',
  white: '#FAFAFA',
  text: '#E8E8EA',
  muted: '#7A7A82',
  mutedSoft: '#9B9BA3',
  red: '#E50914',
  ai: '#C9A9FF',
};

export const MovieChatSection: React.FC<MovieChatSectionProps> = ({
  movie,
  releaseYear,
  directors,
  genres,
}) => {
  const [messages, setMessages] = useState<{ id: string; role: 'user' | 'assistant'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const sendMessage = useCallback(async (customText?: string) => {
    const text = (customText || input).trim();
    if (!text || loading || !movie) return;

    setInput('');
    const userMsg = { id: Date.now().toString(), role: 'user' as const, text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setLoading(true);

    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });

    try {
      const origLangInfo = LANGUAGE_OPTIONS.find((l) => l.code === movie.original_language);
      const origLangLabel = origLangInfo
        ? origLangInfo.label
        : movie.spoken_languages?.[0]?.english_name || movie.original_language || '';
      const countryLabel =
        movie.production_countries?.[0]?.name ||
        (movie.origin_country?.length > 0 ? movie.origin_country[0] : '');

      const response = await fetch('https://watcher-api-rho.vercel.app/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'movie_chat',
          message: text,
          movieContext: {
            title: movie.title || movie.name,
            year: releaseYear,
            mediaType: movie.media_type,
            originalLanguage: origLangLabel,
            country: countryLabel,
            directors: directors.map((d: any) => d.name).join(', '),
            cast: (movie.cast || []).slice(0, 6).map((c: any) => c.name).join(', '),
            genres: genres.map((g: any) => g.name).join(', '),
            rating: movie.vote_average ? movie.vote_average.toFixed(1) : undefined,
            certification: movie.certification,
            overview: movie.overview,
          },
          history: newHistory.slice(-8),
        }),
      });
      const data = await response.json();
      const botText = data?.result?.text || data?.result || "Couldn't retrieve answer, please try again.";
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', text: botText }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'assistant', text: 'Error connecting to AI. Please try again.' },
      ]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [input, loading, movie, messages, releaseYear, directors, genres]);

  return (
    <View style={styles.container}>
      {messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="robot-happy-outline" size={26} color={C.ai} />
          <Text style={styles.greetingText}>
            Ask anything about <Text style={{ color: C.white, fontWeight: '700' }}>{movie.title || movie.name}</Text>
          </Text>
          <Text style={styles.subGreetingText}>
            Plot insights, director analysis, character motives, themes, and trivia.
          </Text>
          <View style={styles.chipsContainer}>
            {[
              '💡 What are the core themes?',
              '🎬 Director vision & style',
              '🎭 Cast performance highlights',
              '❓ Age rating & suitability',
            ].map((chip) => (
              <TouchableOpacity
                key={chip}
                activeOpacity={0.75}
                style={styles.chip}
                onPress={() => sendMessage(chip.replace(/^[^\s]+\s/, ''))}
              >
                <Text style={styles.chipText}>{chip}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          nestedScrollEnabled={true}
          keyboardShouldPersistTaps="handled"
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((msg) => (
            <View
              key={msg.id}
              style={[
                styles.bubble,
                msg.role === 'user' ? styles.userBubble : styles.botBubble,
              ]}
            >
              {msg.role === 'assistant' ? (
                <FormattedMarkdownText
                  text={msg.text}
                  baseColor="#E0E0E0"
                  boldColor="#FFFFFF"
                  style={styles.botText}
                />
              ) : (
                <Text style={styles.userText}>{msg.text}</Text>
              )}
            </View>
          ))}
          {loading && (
            <View style={[styles.bubble, styles.botBubble, styles.loadingRow]}>
              <ActivityIndicator size="small" color={C.ai} />
              <Text style={styles.loadingText}>Analyzing title...</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Input bar */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder={`Ask about ${movie.title || movie.name}...`}
          placeholderTextColor="#777"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => sendMessage()}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.sendButton, !input.trim() && { opacity: 0.4 }]}
          onPress={() => sendMessage()}
          disabled={!input.trim() || loading}
        >
          <Ionicons name="arrow-up" size={17} color="#FFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default MovieChatSection;

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  greetingText: {
    color: C.text,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 4,
  },
  subGreetingText: {
    color: C.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  chip: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  chipText: {
    color: '#E0E0E0',
    fontSize: 11.5,
    fontWeight: '500',
  },
  scrollArea: {
    maxHeight: 280,
    marginBottom: 8,
  },
  scrollContent: {
    paddingVertical: 6,
    gap: 10,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    maxWidth: '88%',
  },
  userBubble: {
    backgroundColor: C.red,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 2,
  },
  botBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  userText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    lineHeight: 19,
  },
  botText: {
    color: '#E0E0E0',
    fontSize: 13.5,
    lineHeight: 20,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: C.mutedSoft,
    fontSize: 13,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 4,
    marginTop: 6,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13.5,
    paddingVertical: 6,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.red,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
