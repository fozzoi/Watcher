import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, Image, Dimensions, ScrollView, StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown, FadeInUp, FadeIn, useSharedValue, useAnimatedStyle,
  withSpring, interpolate, Extrapolation,
} from 'react-native-reanimated';
import {
  LANGUAGE_OPTIONS, GENRE_OPTIONS,
  completeOnboarding, FavoriteActor,
} from '../src/userPreferences';
import { searchPeople, getImageUrl } from '../src/tmdb';

const { width, height } = Dimensions.get('window');

const ACCENT = '#E50914';
const STEP_COUNT = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Step Indicator
// ─────────────────────────────────────────────────────────────────────────────
const StepDots = ({ current }: { current: number }) => (
  <View style={styles.dotsRow}>
    {Array.from({ length: STEP_COUNT }).map((_, i) => (
      <View key={i} style={[styles.dot, i === current && styles.dotActive]} />
    ))}
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Languages
// ─────────────────────────────────────────────────────────────────────────────
const LanguageStep = ({
  selected, onToggle,
}: { selected: string[]; onToggle: (code: string) => void }) => (
  <View style={{ flex: 1 }}>
    <Animated.Text entering={FadeInDown.delay(100).springify()} style={styles.stepTitle}>
      What languages do you enjoy? 🌍
    </Animated.Text>
    <Animated.Text entering={FadeInDown.delay(180).springify()} style={styles.stepSub}>
      Pick as many as you like. Your Explore page will be personalised to these.
    </Animated.Text>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.chipGrid}>
      {LANGUAGE_OPTIONS.map((lang, i) => {
        const active = selected.includes(lang.code);
        return (
          <Animated.View key={lang.code} entering={FadeInDown.delay(200 + i * 30).springify()}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => onToggle(lang.code)}
              style={[styles.langChip, active && styles.langChipActive]}
            >
              <Text style={styles.chipFlag}>{lang.flag}</Text>
              <View>
                <Text style={[styles.chipLang, active && styles.chipLangActive]}>{lang.label}</Text>
                <Text style={[styles.chipIndustry, active && styles.chipIndustryActive]}>{lang.industry}</Text>
              </View>
              {active && <Ionicons name="checkmark-circle" size={18} color={ACCENT} style={{ marginLeft: 'auto' }} />}
            </TouchableOpacity>
          </Animated.View>
        );
      })}
    </ScrollView>
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Genres
// ─────────────────────────────────────────────────────────────────────────────
const GenreStep = ({
  selected, onToggle,
}: { selected: number[]; onToggle: (id: number) => void }) => (
  <View style={{ flex: 1 }}>
    <Animated.Text entering={FadeInDown.delay(100).springify()} style={styles.stepTitle}>
      What genres do you love? 🎬
    </Animated.Text>
    <Animated.Text entering={FadeInDown.delay(180).springify()} style={styles.stepSub}>
      Your picks shape the AI's recommendations and your Explore carousels.
    </Animated.Text>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.genreGrid}>
      {GENRE_OPTIONS.map((genre, i) => {
        const active = selected.includes(genre.id);
        return (
          <Animated.View key={genre.id} entering={FadeInDown.delay(200 + i * 25).springify()}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => onToggle(genre.id)}
              style={[styles.genreChip, active && styles.genreChipActive]}
            >
              <Text style={styles.genreEmoji}>{genre.emoji}</Text>
              <Text style={[styles.genreLabel, active && styles.genreLabelActive]}>{genre.label}</Text>
            </TouchableOpacity>
          </Animated.View>
        );
      })}
    </ScrollView>
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Favourite Actors
// ─────────────────────────────────────────────────────────────────────────────
const ActorStep = ({
  selected, onToggle,
}: { selected: FavoriteActor[]; onToggle: (actor: FavoriteActor) => void }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<any>(null);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchPeople(text, 10);
        setResults(res);
      } catch { setResults([]); }
      setLoading(false);
    }, 400);
  }, []);

  const isSelected = (id: number) => selected.some(a => a.id === id);

  return (
    <View style={{ flex: 1 }}>
      <Animated.Text entering={FadeInDown.delay(100).springify()} style={styles.stepTitle}>
        Any favourite actors? ⭐
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(180).springify()} style={styles.stepSub}>
        Optional. The AI will prioritise their films. You can add or change this later.
      </Animated.Text>

      {/* Search bar */}
      <Animated.View entering={FadeInDown.delay(250).springify()} style={styles.actorSearch}>
        <Ionicons name="search" size={16} color="#666" />
        <TextInput
          style={styles.actorSearchInput}
          placeholder="Search actors, directors..."
          placeholderTextColor="#555"
          value={query}
          onChangeText={handleSearch}
          returnKeyType="search"
        />
        {loading && <ActivityIndicator size="small" color={ACCENT} />}
      </Animated.View>

      {/* Selected actors row */}
      {selected.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectedRow} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
          {selected.map(actor => (
            <TouchableOpacity key={actor.id} onPress={() => onToggle(actor)} style={styles.selectedActor}>
              <Image source={{ uri: getImageUrl(actor.profile_path, 'w92') }} style={styles.selectedActorImg} />
              <View style={styles.selectedActorBadge}>
                <Ionicons name="close" size={10} color="#fff" />
              </View>
              <Text style={styles.selectedActorName} numberOfLines={1}>{actor.name.split(' ')[0]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Results list */}
      <FlatList
        data={query ? results : []}
        keyExtractor={item => String(item.id)}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const sel = isSelected(item.id);
          return (
            <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.actorRow, sel && styles.actorRowActive]}
                onPress={() => onToggle({ id: item.id, name: item.name, profile_path: item.profile_path })}
              >
                <Image
                  source={{ uri: getImageUrl(item.profile_path, 'w92') }}
                  style={styles.actorRowImg}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.actorRowName}>{item.name}</Text>
                  {item.known_for_department && (
                    <Text style={styles.actorRowDept}>{item.known_for_department}</Text>
                  )}
                </View>
                {sel && <Ionicons name="checkmark-circle" size={20} color={ACCENT} />}
              </TouchableOpacity>
            </Animated.View>
          );
        }}
        ListEmptyComponent={
          !query ? (
            <View style={styles.actorEmpty}>
              <Text style={styles.actorEmptyText}>Start typing to search for actors, directors and more</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Onboarding Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [languages, setLanguages] = useState<string[]>(['en', 'hi']); // sensible defaults
  const [genreIds, setGenreIds] = useState<number[]>([]);
  const [actors, setActors] = useState<FavoriteActor[]>([]);
  const [saving, setSaving] = useState(false);

  const toggleLanguage = (code: string) =>
    setLanguages(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);

  const toggleGenre = (id: number) =>
    setGenreIds(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);

  const toggleActor = (actor: FavoriteActor) =>
    setActors(prev => prev.some(a => a.id === actor.id) ? prev.filter(a => a.id !== actor.id) : [...prev, actor]);

  const handleFinish = async () => {
    setSaving(true);
    await completeOnboarding({ country: 'IN', languages, genreIds, favoriteActors: actors });
    setSaving(false);
    router.replace('/(tabs)');
  };

  const canContinue = step === 0 ? languages.length > 0 : true;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#0A0A0F', '#0E0008', '#000']} style={StyleSheet.absoluteFill} />

      {/* Decorative orb */}
      <View style={styles.orb} />

      {/* Header */}
      <Animated.View entering={FadeIn.delay(50)} style={styles.header}>
        <Text style={styles.appName}>WATCHER</Text>
        <StepDots current={step} />
      </Animated.View>

      {/* Step content */}
      <View style={styles.content}>
        {step === 0 && <LanguageStep selected={languages} onToggle={toggleLanguage} />}
        {step === 1 && <GenreStep selected={genreIds} onToggle={toggleGenre} />}
        {step === 2 && <ActorStep selected={actors} onToggle={toggleActor} />}
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {step > 0 && (
          <TouchableOpacity activeOpacity={0.8} onPress={() => setStep(s => s - 1)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#888" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          activeOpacity={0.9}
          disabled={!canContinue || saving}
          onPress={step < STEP_COUNT - 1 ? () => setStep(s => s + 1) : handleFinish}
          style={[styles.nextBtn, !canContinue && { opacity: 0.4 }]}
        >
          <LinearGradient colors={[ACCENT, '#C00']} style={styles.nextBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.nextBtnText}>{step < STEP_COUNT - 1 ? 'Continue' : "Let's go!"}</Text>
                <Ionicons name={step < STEP_COUNT - 1 ? 'arrow-forward' : 'checkmark'} size={18} color="#fff" />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {step === STEP_COUNT - 1 && (
          <TouchableOpacity onPress={handleFinish} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  orb: {
    position: 'absolute', top: -80, left: width * 0.5 - 150,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(229,9,20,0.12)',
    transform: [{ scaleX: 2 }],
  },
  header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8, alignItems: 'center' },
  appName: { color: ACCENT, fontSize: 13, fontWeight: '900', letterSpacing: 6, marginBottom: 16 },
  dotsRow: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)' },
  dotActive: { width: 24, backgroundColor: ACCENT },

  content: { flex: 1, paddingHorizontal: 20 },

  stepTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 8, marginTop: 8 },
  stepSub: { color: '#888', fontSize: 14, lineHeight: 20, marginBottom: 20 },

  // Language chips
  chipGrid: { paddingBottom: 24, gap: 10 },
  langChip: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  langChipActive: { borderColor: ACCENT, backgroundColor: 'rgba(229,9,20,0.12)' },
  chipFlag: { fontSize: 24 },
  chipLang: { color: '#ccc', fontSize: 15, fontWeight: '600' },
  chipLangActive: { color: '#fff' },
  chipIndustry: { color: '#555', fontSize: 12, marginTop: 1 },
  chipIndustryActive: { color: 'rgba(229,9,20,0.8)' },

  // Genre chips — 2-column wrapping grid
  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 24 },
  genreChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 50, paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  genreChipActive: { borderColor: ACCENT, backgroundColor: 'rgba(229,9,20,0.14)' },
  genreEmoji: { fontSize: 16 },
  genreLabel: { color: '#bbb', fontSize: 14, fontWeight: '600' },
  genreLabelActive: { color: '#fff' },

  // Actor search
  actorSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 16,
  },
  actorSearchInput: { flex: 1, color: '#fff', fontSize: 15 },

  selectedRow: { marginBottom: 16, flexGrow: 0 },
  selectedActor: { alignItems: 'center', width: 60 },
  selectedActorImg: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#222', borderWidth: 2, borderColor: ACCENT },
  selectedActorBadge: {
    position: 'absolute', top: 0, right: 0,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: ACCENT, justifyContent: 'center', alignItems: 'center',
  },
  selectedActorName: { color: '#ccc', fontSize: 11, marginTop: 4, textAlign: 'center' },

  actorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  actorRowActive: { backgroundColor: 'rgba(229,9,20,0.06)', borderRadius: 10 },
  actorRowImg: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#222' },
  actorRowName: { color: '#eee', fontSize: 15, fontWeight: '600' },
  actorRowDept: { color: '#666', fontSize: 12, marginTop: 2 },

  actorEmpty: { alignItems: 'center', paddingTop: 40 },
  actorEmptyText: { color: '#444', fontSize: 14, textAlign: 'center' },

  // Footer
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  backBtn: {
    position: 'absolute', left: 20, bottom: 82,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.07)',
    justifyContent: 'center', alignItems: 'center',
  },
  nextBtn: { borderRadius: 16, overflow: 'hidden' },
  nextBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn: { alignItems: 'center' },
  skipText: { color: '#555', fontSize: 13 },
});
