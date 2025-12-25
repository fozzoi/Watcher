import React, { useState, useEffect } from "react";
import { 
  View, StyleSheet, Alert, Linking, StatusBar, 
  ScrollView, TouchableOpacity, TextInput, 
  Keyboard, ActivityIndicator, Text, BackHandler,
  LayoutAnimation, Platform, UIManager, Dimensions
} from "react-native";
import { LinearGradient } from 'expo-linear-gradient';

// Legacy import for Expo 50+ (fixes deprecation warning)
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing"; 
import { useNavigation } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RouteProp, useRoute } from "@react-navigation/native";
import { Ionicons, MaterialIcons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { torrentScraper } from '../src/Scraper';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');

interface Result {
  id: number | string;
  name: string;
  size: string;
  source: string;
  url: string; 
  seeds?: number;
  peers?: number;
}

type SearchRouteParamList = {
  Search: { prefillQuery?: string };
};

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

export default function Index() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<SearchRouteParamList, 'Search'>>();
  
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [showMore, setShowMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(false);

  // --- BACK HANDLER ---
  useEffect(() => {
    const onBackPress = () => {
      if (hasSearched || searchQuery.trim() !== '') {
        handleClear();
        return true; 
      }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [hasSearched, searchQuery]);

  // --- HELPERS ---
  const getQualityInfo = (name: string): { label: string; color: string } => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('2160p') || lowerName.includes('4k')) return { label: '4K', color: '#00ff08' };
    if (lowerName.includes('1080p')) return { label: '1080p', color: '#1500ff' };
    if (lowerName.includes('720p')) return { label: '720p', color: '#ff6e00' };
    return { label: 'SD', color: '#666' };
  };

  useEffect(() => {
    if (route.params?.prefillQuery) {
      setSearchQuery(route.params.prefillQuery); 
      handleSearch(route.params.prefillQuery); 
    }
  }, [route.params?.prefillQuery]); 

  const configureAnimation = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const handleSearch = async (query: string = searchQuery) => {
    if (!query.trim()) return;
    Keyboard.dismiss();
    configureAnimation();
    setHasSearched(true);
    setLoading(true);
    setResults([]); 
    
    try {
      const scrapedResults = await torrentScraper.searchAll(query);
      const sortedResults = scrapedResults.sort((a, b) => (b.seeds || 0) - (a.seeds || 0));
      setResults(sortedResults);
    } catch (error) {
      Alert.alert("Error", "Failed to fetch search results.");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
      configureAnimation();
      setSearchQuery('');
      setResults([]);
      setHasSearched(false);
      Keyboard.dismiss();
  };

  // --- SMART FILE DOWNLOADER (.torrent) ---
  const handleShareAsFile = async (url: string, fileName: string) => {
    setDownloadingFile(true);
    try {
        const cleanName = fileName.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
        const fileUri = FileSystem.documentDirectory + cleanName + '.torrent';
        
        let success = false;

        // 1. Try Cache if Magnet
        if (url.startsWith('magnet:')) {
            const match = url.match(/xt=urn:btih:([a-zA-Z0-9]+)/);
            if (match && match[1]) {
                const hash = match[1].toUpperCase();
                const cacheUrl = `https://itorrents.org/torrent/${hash}.torrent`;
                try {
                    const downloadRes = await FileSystem.downloadAsync(cacheUrl, fileUri);
                    if (downloadRes.status === 200) success = true; 
                } catch (e) { /* ignore cache miss */ }
            }
        }

        // 2. Fallback: Download direct URL or write Text
        if (!success) {
            if (!url.startsWith('magnet:')) {
                try {
                    await FileSystem.downloadAsync(url, fileUri);
                    success = true;
                } catch(e) {}
            }
            if (!success) {
                await FileSystem.writeAsStringAsync(fileUri, url);
            }
        }

        // 3. Share
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, { 
                mimeType: 'application/x-bittorrent', 
                dialogTitle: 'Share Torrent File' 
            });
        } else {
            Alert.alert("Saved", `File saved to: ${fileUri}`);
        }

    } catch (error) {
        Alert.alert("Error", "Failed to create file.");
    } finally {
        setDownloadingFile(false);
    }
  };

  const renderResults = () => {
    const visibleResults = showMore ? results : results.slice(0, 5);
    
    return visibleResults.map((item, index) => {
      const quality = getQualityInfo(item.name);
      const seedsCount = item.seeds || 0;
      let healthColor = '#EF4444'; 
      if (seedsCount > 50) healthColor = '#22C55E'; 
      else if (seedsCount > 10) healthColor = '#EAB308'; 

      return (
        <Animated.View key={index} entering={FadeInUp.delay(index * 100).springify()} style={styles.card}>
          <View style={styles.cardInner}>
            <View style={styles.iconContainer}>
               <MaterialCommunityIcons name="file-video-outline" size={32} color="#666" />
            </View>
            <View style={styles.cardContent}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
                <View style={styles.tagsRow}>
                    <View style={[styles.tag, { borderColor: quality.color, borderWidth: 1 }]}>
                        <Text style={[styles.tagText, { color: quality.color }]}>{quality.label}</Text>
                    </View>
                    <View style={styles.tag}><Text style={styles.tagText}>{item.size}</Text></View>
                    <View style={[styles.tag, { backgroundColor: '#333' }]}><Text style={[styles.tagText, { color: '#AAA' }]}>{item.source}</Text></View>
                </View>
                <View style={styles.seedRow}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                         <Feather name="arrow-up" size={12} color={healthColor} />
                         <Text style={{color: healthColor, fontSize: 12, fontWeight:'bold'}}>{item.seeds} Seeds</Text>
                    </View>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 12}}>
                         <Feather name="arrow-down" size={12} color="#888" />
                         <Text style={{color: '#888', fontSize: 12}}>{item.peers} Peers</Text>
                    </View>
                </View>
            </View>
          </View>
          
          <View style={styles.actionRow}>
                <TouchableOpacity 
                    style={styles.shareBtn} 
                    onPress={() => handleShareAsFile(item.url, item.name)}
                    disabled={downloadingFile}
                >
                    {downloadingFile ? <ActivityIndicator size="small" color="#AAA" /> : <Feather name="share-2" size={18} color="#AAA" />}
                </TouchableOpacity>

                <TouchableOpacity 
                    style={styles.downloadBtn} 
                    onPress={async () => {
                         const supported = await Linking.canOpenURL(item.url);
                         if(supported) await Linking.openURL(item.url);
                         else Alert.alert("No App", "Install a torrent client like Flud.");
                    }}
                >
                    <MaterialCommunityIcons name="magnet" size={18} color="white" />
                    <Text style={styles.downloadText}>Open Magnet</Text>
                </TouchableOpacity>
          </View>
        </Animated.View>
      );
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <LinearGradient colors={['#0F0F0F', '#000']} style={StyleSheet.absoluteFillObject} />

      <View style={[
          styles.contentWrapper,
          !hasSearched 
            // IDLE STATE: Center vertically, but add bottom padding to push it UP visually
            ? { justifyContent: 'center', paddingBottom: 150 } 
            // ACTIVE STATE: Only use top inset, moving it very close to top
            : { paddingTop: insets.top }
      ]}>

        {!hasSearched && (
            <View style={styles.brandContainer}>
                <MaterialCommunityIcons name="magnet-on" size={60} color="#E50914" style={{ marginBottom: 16 }} />
                <Text style={styles.brandTitle}>Torrent Search</Text>
                <TouchableOpacity 
                    onPress={() => navigation.navigate("history")}
                    style={styles.historyPill}
                >
                    <MaterialIcons name="history" size={16} color="#CCC" />
                    <Text style={{ color: '#CCC', fontSize: 12, fontWeight: '600' }}>History</Text>
                </TouchableOpacity>
            </View>
        )}

        <View style={[styles.searchSection, hasSearched && styles.searchSectionActive]}>
            <View style={styles.inputWrapper}>
                <Ionicons name="search" size={20} color="#666" style={{ marginLeft: 16 }} />
                <TextInput
                    style={styles.input}
                    placeholder="Search movies, shows, anime..."
                    placeholderTextColor="#666"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onSubmitEditing={() => handleSearch()}
                    returnKeyType="search"
                    keyboardAppearance="dark"
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={handleClear} style={{ padding: 10 }}>
                        <Ionicons name="close-circle" size={18} color="#666" />
                    </TouchableOpacity>
                )}
            </View>
        </View>

        {hasSearched && (
            <AnimatedScrollView 
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                style={{ width: '100%' }}
            >
                <View style={styles.resultsHeader}>
                     <Text style={styles.resultsTitle}>{loading ? 'Searching...' : 'Results'}</Text>
                     <TouchableOpacity onPress={() => navigation.navigate("history")}>
                        <MaterialIcons name="history" size={24} color="#666" />
                     </TouchableOpacity>
                </View>

                {loading ? (
                    <View style={styles.loaderContainer}>
                        <ActivityIndicator size="large" color="#E50914" />
                        <Text style={styles.loadingText}>Scraping sources...</Text>
                    </View>
                ) : (
                    <View style={{ gap: 16 }}>
                        {results.length > 0 ? renderResults() : (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyText}>No results found.</Text>
                            </View>
                        )}
                        
                        {results.length > 5 && (
                            <TouchableOpacity onPress={() => setShowMore(!showMore)} style={styles.showMoreBtn}>
                                <Text style={styles.showMoreText}>{showMore ? "Show Less" : "Show More Results"}</Text>
                                <Feather name={showMore ? "chevron-up" : "chevron-down"} size={16} color="#888" />
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </AnimatedScrollView>
        )}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  contentWrapper: { flex: 1, alignItems: 'center' },
  brandContainer: { alignItems: 'center', marginBottom: 40 },
  brandTitle: { color: 'white', fontSize: 28, fontWeight: 'bold', marginBottom: 20 },
  historyPill: { 
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: '#1A1A1A', paddingHorizontal: 16, paddingVertical: 8,
      borderRadius: 20, borderWidth: 1, borderColor: '#333'
  },
  searchSection: { width: '100%', paddingHorizontal: 20 },
  searchSectionActive: { marginBottom: 10 }, 
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1A1A1A', width: '100%', height: 52,
    borderRadius: 26, borderWidth: 1, borderColor: '#333',
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 4.65, elevation: 8,
  },
  input: { flex: 1, color: 'white', paddingHorizontal: 12, fontSize: 16 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 100 },
  resultsHeader: { 
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
      marginBottom: 16, marginTop: 10 
  },
  resultsTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  card: { 
      backgroundColor: '#111', borderRadius: 16, borderWidth: 1, borderColor: '#222',
      marginBottom: 16, overflow: 'hidden'
  },
  cardInner: { flexDirection: 'row', padding: 16 },
  iconContainer: {
      width: 50, height: 50, borderRadius: 12, backgroundColor: '#1A1A1A', 
      justifyContent: 'center', alignItems: 'center', marginRight: 16
  },
  cardContent: { flex: 1 },
  cardTitle: { color: 'white', fontSize: 16, fontWeight: 'bold', marginBottom: 8, lineHeight: 22 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tag: { backgroundColor: '#1A1A1A', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tagText: { color: '#CCC', fontSize: 11, fontWeight: '600' },
  seedRow: { flexDirection: 'row', alignItems: 'center' },
  actionRow: {
      flexDirection: 'row', backgroundColor: '#161616', padding: 12,
      borderTopWidth: 1, borderTopColor: '#222', justifyContent: 'space-between', alignItems: 'center'
  },
  shareBtn: { padding: 10, borderRadius: 8, backgroundColor: '#222', width: 44, alignItems: 'center' },
  downloadBtn: {
      flex: 1, marginLeft: 12, backgroundColor: '#E50914', borderRadius: 8,
      flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 10, gap: 8
  },
  downloadText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  loaderContainer: { marginTop: 50, alignItems: 'center' },
  loadingText: { color: '#666', marginTop: 16 },
  emptyState: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: '#666', fontSize: 16 },
  showMoreBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 20, gap: 8 },
  showMoreText: { color: '#888', fontWeight: '600' },
});