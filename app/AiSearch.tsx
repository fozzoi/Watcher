import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, FlatList, 
  Image, ActivityIndicator, StyleSheet, StatusBar, Keyboard, 
  KeyboardAvoidingView, Platform, Dimensions, LayoutAnimation, UIManager 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { getGeminiRecommendations } from '../src/ai'; // Ensure this matches your file structure
import { getImageUrl, getFullDetails } from '../src/tmdb';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width, height } = Dimensions.get('window');

const STATIC_VIBES = [
  "🤯 Mind-bending Thriller", "🚀 Stunning Sci-Fi", "👻 Elevated Horror",
  "🌧️ Cozy Rainy Day", "🕵️ Noir Mystery", "🏎️ High Octane Action",
  "🤣 Feel-good Comedy", "⚔️ Epic Fantasy", "💔 Tragic Romance",
  "🧠 Psychological Drama", "🎨 Visually Stunning", "🧟 Zombie Apocalypse"
];

const AiSearch = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  
  // State
  const [prompt, setPrompt] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [dynamicChips, setDynamicChips] = useState<string[]>([]);

  // Shuffle chips on mount for "Dynamic" feel
  useEffect(() => {
    const shuffled = [...STATIC_VIBES].sort(() => 0.5 - Math.random());
    setDynamicChips(shuffled.slice(0, 6)); // Pick 6 random ones
  }, []);

  const handleGenerate = async (queryOverride?: string) => {
    const query = queryOverride || prompt;
    if (!query.trim()) return;

    Keyboard.dismiss();
    configureAnimation(); // Smooth slide up
    setHasSearched(true);
    setLoading(true);
    setResults([]); 
    
    // Artificial delay for smoother UI transition
    setTimeout(async () => {
        const movies = await getGeminiRecommendations(query);
        setResults(movies);
        setLoading(false);
    }, 300);
  };

  const handleRandom = async () => {
      const randomPrompts = [
          "Suggest exactly one obscure but amazing movie that nobody talks about.",
          "Give me one movie that will change my life.",
          "Suggest one highly rated cult classic movie."
      ];
      const randomQ = randomPrompts[Math.floor(Math.random() * randomPrompts.length)];
      setPrompt("🎲 Feeling Lucky...");
      handleGenerate(randomQ);
  };

  const configureAnimation = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const handleClear = () => {
      configureAnimation();
      setPrompt('');
      setResults([]);
      setHasSearched(false);
      Keyboard.dismiss();
  };

  // --- RENDER ITEM ---
  const renderResultItem = ({ item, index }: { item: any, index: number }) => (
    <Animated.View entering={FadeInUp.delay(index * 100).springify()} style={{ marginBottom: 16 }}>
      <TouchableOpacity 
        activeOpacity={0.9}
        onPress={async () => {
          const full = await getFullDetails(item);
          navigation.navigate('Detail', { movie: full });
        }}
        style={styles.card}
      >
        <Image 
            source={{ uri: getImageUrl(item.poster_path, 'w92') }} 
            style={styles.cardGlow} 
            blurRadius={30} 
        />
        
        <View style={styles.cardInner}>
            <Image source={{ uri: getImageUrl(item.poster_path, 'w185') }} style={styles.poster} />
            <View style={styles.cardContent}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                
                <View style={styles.tagsRow}>
                    <View style={styles.tag}>
                        <Ionicons name="star" color="#FFD700" size={10} />
                        <Text style={styles.tagText}>{item.vote_average?.toFixed(1)}</Text>
                    </View>
                    <View style={[styles.tag, { backgroundColor: '#333' }]}>
                        <Text style={[styles.tagText, { color: '#AAA' }]}>
                            {item.release_date?.split('-')[0] || 'N/A'}
                        </Text>
                    </View>
                </View>

                <Text style={styles.cardOverview} numberOfLines={3}>{item.overview}</Text>
            </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <LinearGradient colors={['#0F0F0F', '#000']} style={StyleSheet.absoluteFillObject} />

      {/* --- CONTENT AREA --- */}
      <View style={[
          styles.contentWrapper, 
          !hasSearched && { justifyContent: 'center' }, // Center vertically if idle
          { paddingTop: hasSearched ? insets.top + 20 : 0 }
      ]}>

        {/* 1. LOGO & BRANDING (Only visible when idle) */}
        {!hasSearched && (
            <View style={styles.logoContainer}>
                <Image 
                    source={{ uri: "https://upload.wikimedia.org/wikipedia/commons/8/8a/Google_Gemini_logo.svg" }} 
                    style={{ width: 60, height: 60, tintColor: 'white', marginBottom: 16 }} 
                    resizeMode="contain"
                />
                <Text style={styles.brandTitle}>What's the vibe?</Text>
            </View>
        )}

        {/* 2. SEARCH BAR (Moves to top when searched) */}
        <View style={[styles.searchBlock, hasSearched && styles.searchBlockActive]}>
            <View style={styles.inputWrapper}>
                <Ionicons name="search" size={20} color="#666" style={{ marginLeft: 16 }} />
                <TextInput
                    style={styles.input}
                    placeholder="Describe a plot, mood, or specific taste..."
                    placeholderTextColor="#666"
                    value={prompt}
                    onChangeText={setPrompt}
                    onSubmitEditing={() => handleGenerate()}
                    returnKeyType="search"
                />
                {prompt.length > 0 && (
                    <TouchableOpacity onPress={() => setPrompt('')} style={{ padding: 10 }}>
                        <Ionicons name="close-circle" size={18} color="#666" />
                    </TouchableOpacity>
                )}
            </View>

            {/* ACTION BUTTONS (Only visible when idle) */}
            {!hasSearched && (
                <View style={styles.actionButtons}>
                    <TouchableOpacity 
                        style={styles.mainBtn} 
                        onPress={() => handleGenerate()}
                    >
                        <Text style={styles.mainBtnText}>Search</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={styles.luckyBtn} 
                        onPress={handleRandom}
                    >
                        <MaterialCommunityIcons name="dice-3" size={18} color="#A962FF" />
                        <Text style={styles.luckyBtnText}>Surprise Me</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>

        {/* 3. DYNAMIC CHIPS (Only visible when idle) */}
        {!hasSearched && (
            <View style={styles.chipsContainer}>
                {dynamicChips.map((vibe, i) => (
                    <TouchableOpacity 
                        key={i} 
                        style={styles.chip}
                        onPress={() => { setPrompt(vibe); handleGenerate(vibe); }}
                    >
                        <Text style={styles.chipText}>{vibe}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        )}

        {/* 4. RESULTS LIST */}
        {hasSearched && (
            <View style={{ flex: 1, width: '100%', paddingHorizontal: 16 }}>
                <View style={styles.resultsHeader}>
                    <Text style={styles.resultsTitle}>
                        {loading ? 'Thinking...' : 'Here are some picks:'}
                    </Text>
                    <TouchableOpacity onPress={handleClear}>
                        <Text style={{ color: '#A962FF', fontWeight: 'bold' }}>Close</Text>
                    </TouchableOpacity>
                </View>

                {loading ? (
                    <View style={{ marginTop: 100, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#A962FF" />
                        <Text style={{ color: '#666', marginTop: 16 }}>Scanning the multiverse...</Text>
                    </View>
                ) : (
                    <FlatList
                        data={results}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={renderResultItem}
                        contentContainerStyle={{ paddingBottom: 100 }} // FIX: Padding for bottom tab bar
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </View>
        )}

      </View>
    </View>
  );
};

export default AiSearch;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  contentWrapper: { flex: 1, alignItems: 'center' },

  // LOGO
  logoContainer: { alignItems: 'center', marginBottom: 30 },
  brandTitle: { color: 'white', fontSize: 24, fontWeight: '300', letterSpacing: 1 },

  // SEARCH BAR
  searchBlock: { width: '100%', alignItems: 'center', paddingHorizontal: 20 },
  searchBlockActive: { marginBottom: 10 }, // Margin when at top

  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1A1A1A', width: '100%', height: 52,
    borderRadius: 26, borderWidth: 1, borderColor: '#333',
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 4.65, elevation: 8,
  },
  input: { flex: 1, color: 'white', paddingHorizontal: 12, fontSize: 16 },

  // BUTTONS
  actionButtons: { flexDirection: 'row', gap: 12, marginTop: 20 },
  mainBtn: {
    backgroundColor: '#222', paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 8, borderWidth: 1, borderColor: '#333'
  },
  mainBtnText: { color: '#EEE', fontWeight: '500' },
  luckyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#222', paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 8, borderWidth: 1, borderColor: '#333'
  },
  luckyBtnText: { color: '#EEE', fontWeight: '500' },

  // CHIPS
  chipsContainer: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 10, marginTop: 40, paddingHorizontal: 20, maxWidth: 500
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#333'
  },
  chipText: { color: '#AAA', fontSize: 13 },

  // RESULTS
  resultsHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      width: '100%', marginBottom: 16, marginTop: 10
  },
  resultsTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },

  // CARD STYLES
  card: { height: 140, borderRadius: 12, backgroundColor: '#111', overflow: 'hidden', flexDirection: 'row' },
  cardGlow: { position: 'absolute', width: '100%', height: '100%', opacity: 0.2 },
  cardInner: { flexDirection: 'row', flex: 1, backgroundColor: 'rgba(20,20,20,0.6)' },
  poster: { width: 94, height: '100%' },
  cardContent: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { color: 'white', fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  tagsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#222', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagText: { color: '#DDD', fontSize: 11, fontWeight: '700' },
  cardOverview: { color: '#999', fontSize: 12, lineHeight: 16 },
});