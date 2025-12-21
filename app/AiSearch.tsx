import React, { useState, useRef, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, FlatList, 
  Image, ActivityIndicator, StyleSheet, StatusBar, Keyboard, 
  KeyboardAvoidingView, Platform, Dimensions 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur'; 
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';

import { getGeminiRecommendations } from '../src/ai';
import { getImageUrl, getFullDetails } from '../src/tmdb';

const { width } = Dimensions.get('window');

const VIBE_CHIPS = [
  "🤯 Mind-bending Thriller",
  "🚀 Stunning Sci-Fi",
  "👻 Elevated Horror",
  "🌧️ Cozy Rainy Day",
  "🕵️ Noir Mystery",
  "🏎️ High Octane Action",
  "🤣 Feel-good Comedy",
  "⚔️ Epic Fantasy"
];

const AiSearch = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  
  const [prompt, setPrompt] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const handleGenerate = async (queryOverride?: string) => {
    const query = queryOverride || prompt;
    if (!query.trim()) return;

    Keyboard.dismiss();
    setLoading(true);
    setResults([]); 
    
    // Slight delay to allow UI to reset
    setTimeout(async () => {
        const movies = await getGeminiRecommendations(query);
        setResults(movies);
        setLoading(false);
    }, 100);
  };

  // --- RENDERERS ---

  const renderResultItem = ({ item, index }: { item: any, index: number }) => (
    <Animated.View entering={FadeInUp.delay(index * 100).springify()} style={{ marginBottom: 20 }}>
      <TouchableOpacity 
        activeOpacity={0.9}
        onPress={async () => {
          const full = await getFullDetails(item);
          navigation.navigate('Detail', { movie: full });
        }}
        style={styles.card}
      >
        {/* Backdrop Glow */}
        <Image 
            source={{ uri: getImageUrl(item.poster_path, 'w92') }} 
            style={styles.cardGlow} 
            blurRadius={20} 
        />
        
        <View style={styles.cardInner}>
            <Image source={{ uri: getImageUrl(item.poster_path, 'w342') }} style={styles.poster} />
            <View style={styles.cardContent}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                
                <View style={styles.tagsRow}>
                    <View style={styles.tag}>
                        <Ionicons name="star" color="#FFD700" size={10} />
                        <Text style={styles.tagText}>{item.vote_average?.toFixed(1)}</Text>
                    </View>
                    <View style={[styles.tag, { backgroundColor: '#222' }]}>
                        <Text style={[styles.tagText, { color: '#888' }]}>
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
      
      {/* 1. KEYBOARD FIX: This wrapper pushes everything up naturally */}
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
        <LinearGradient colors={['#000', '#111']} style={StyleSheet.absoluteFillObject} />
        
        {/* Header */}
        <View style={[styles.header, { marginTop: insets.top }]}>
            <View style={styles.headerLeft}>
                <Image 
                    source={{ uri: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-gemini-icon.png" }} 
                    style={{ width: 24, height: 24, tintColor: '#A962FF' }} 
                />
                <Text style={styles.headerTitle}>AI Concierge</Text>
            </View>
            {results.length > 0 && (
                <TouchableOpacity onPress={() => { setResults([]); setPrompt(''); }}>
                    <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
            )}
        </View>

        {/* Main Content Area */}
        <View style={{ flex: 1 }}>
            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#A962FF" />
                    <Text style={styles.loadingText}>Dreaming up movies...</Text>
                </View>
            ) : results.length > 0 ? (
                <FlatList
                    ref={flatListRef}
                    data={results}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={renderResultItem}
                    contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
                    showsVerticalScrollIndicator={false}
                />
            ) : (
                /* EMPTY STATE: Suggestions */
                <View style={styles.suggestionsContainer}>
                    <Text style={styles.heroText}>What are we watching?</Text>
                    <View style={styles.chipsContainer}>
                        {VIBE_CHIPS.map((vibe, i) => (
                            <TouchableOpacity 
                                key={i} 
                                style={styles.chip}
                                onPress={() => { setPrompt(vibe); handleGenerate(vibe); }}
                            >
                                <Text style={styles.chipText}>{vibe}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}
        </View>

        {/* INPUT BAR: Now part of the flex layout, not absolute */}
        <View style={styles.inputSection}>
            <BlurView intensity={20} tint="dark" style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    placeholder="Describe a mood, plot, or vibe..."
                    placeholderTextColor="#666"
                    value={prompt}
                    onChangeText={setPrompt}
                    returnKeyType="search"
                    onSubmitEditing={() => handleGenerate()}
                    selectionColor="#A962FF"
                />
                <TouchableOpacity 
                    style={[styles.sendBtn, { backgroundColor: prompt ? '#A962FF' : '#333' }]}
                    onPress={() => handleGenerate()}
                    disabled={!prompt}
                >
                    <Ionicons name="arrow-up" size={20} color={prompt ? '#FFF' : '#666'} />
                </TouchableOpacity>
            </BlurView>
        </View>

      </KeyboardAvoidingView>
    </View>
  );
};

export default AiSearch;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  
  // Header
  header: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' 
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },
  clearText: { color: '#666', fontSize: 14, fontWeight: '600' },

  // Center States
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#666', marginTop: 16, fontSize: 14 },

  // Suggestions
  suggestionsContainer: { flex: 1, padding: 20, justifyContent: 'center' },
  heroText: { color: 'white', fontSize: 32, fontWeight: '300', marginBottom: 30, textAlign: 'left' },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chip: { 
    backgroundColor: '#1A1A1A', paddingHorizontal: 16, paddingVertical: 12, 
    borderRadius: 100, borderWidth: 1, borderColor: '#333' 
  },
  chipText: { color: '#EEE', fontSize: 14, fontWeight: '500' },

  // Input Section (Fixed)
  inputSection: { 
    padding: 16, 
    paddingBottom: Platform.OS === 'android' ? 30 : 16, // Extra safe area for iOS
    backgroundColor: '#000', // Solid background prevents see-through mess
    borderTopWidth: 1, borderTopColor: '#1A1A1A'
  },
  inputContainer: { 
    flexDirection: 'row', alignItems: 'center', 
    backgroundColor: '#111', borderRadius: 50, padding: 6,
    borderWidth: 1, borderColor: '#333'
  },
  input: { 
    flex: 1, height: 44, paddingHorizontal: 16, 
    color: 'white', fontSize: 16 
  },
  sendBtn: { 
    width: 44, height: 44, borderRadius: 22, 
    justifyContent: 'center', alignItems: 'center' 
  },

  // Movie Card
  card: { height: 160, borderRadius: 16, backgroundColor: '#111', overflow: 'hidden' },
  cardGlow: { position: 'absolute', width: '100%', height: '100%', opacity: 0.3 },
  cardInner: { flexDirection: 'row', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)' },
  poster: { width: 106, height: '100%' },
  cardContent: { flex: 1, padding: 14, justifyContent: 'center' },
  cardTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  tagsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tag: { 
    flexDirection: 'row', alignItems: 'center', gap: 4, 
    backgroundColor: '#333', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 
  },
  tagText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  cardOverview: { color: '#AAA', fontSize: 13, lineHeight: 18 },
});