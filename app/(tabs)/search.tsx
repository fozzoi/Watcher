import React, { useState, useEffect, useCallback } from "react";
import { 
  View, StyleSheet, Alert, Linking, StatusBar, 
  ScrollView, TouchableOpacity, TextInput, 
  Keyboard, ActivityIndicator, Text, BackHandler,
  LayoutAnimation, Platform, UIManager, Dimensions
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

// Legacy import for Expo 50+ (fixes deprecation warning)
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing"; 
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons, MaterialIcons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { searchTorrents } from '../../src/Scraper';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedDialog, DialogButton } from '../../src/components/shared/ThemedDialog';



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

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

export default function Index() {
  const router = useRouter();
  const { prefillQuery, fromMovieId, fromMediaType } = useLocalSearchParams<{
    prefillQuery?: string;
    fromMovieId?: string;
    fromMediaType?: string;
  }>();
  const insets = useSafeAreaInsets();
  
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [showMore, setShowMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(false);

  // Themed Dialog State
  const [dialogConfig, setDialogConfig] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    type?: 'info' | 'success' | 'warning' | 'danger';
    buttons?: DialogButton[];
    iconName?: string;
  }>({
    visible: false,
    title: '',
  });

  const showDialog = (config: {
    title: string;
    message?: string;
    type?: 'info' | 'success' | 'warning' | 'danger';
    buttons?: DialogButton[];
    iconName?: string;
  }) => {
    setDialogConfig({ ...config, visible: true });
  };

  const handleGoBack = useCallback(() => {
    Keyboard.dismiss();
    setSearchQuery('');
    setResults([]);
    setHasSearched(false);

    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [router]);

  // --- HELPERS ---
  const getQualityInfo = (name: string): { label: string; color: string } => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('2160p') || lowerName.includes('4k')) return { label: '4K', color: '#00ff08' };
    if (lowerName.includes('1080p')) return { label: '1080p', color: '#1500ff' };
    if (lowerName.includes('720p')) return { label: '720p', color: '#ff6e00' };
    return { label: 'SD', color: '#666' };
  };

  useEffect(() => {
    if (prefillQuery && typeof prefillQuery === 'string') {
      setSearchQuery(prefillQuery); 
      handleSearch(prefillQuery); 
    }
  }, [prefillQuery]);

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
    
    // --- NEW: Save to History ---
    try {
      const jsonValue = await AsyncStorage.getItem("searchHistory");
      let currentHistory = jsonValue ? JSON.parse(jsonValue) : [];
      // Remove duplicate if it already exists to move it to the top
      currentHistory = currentHistory.filter((item: any) => item.query.toLowerCase() !== query.trim().toLowerCase());
      // Append new search (your history.tsx reverses this array later)
      currentHistory.push({ query: query.trim(), date: new Date().toISOString() });
      await AsyncStorage.setItem("searchHistory", JSON.stringify(currentHistory));
    } catch (e) {
      console.log("History save error:", e);
    }
    // ----------------------------

    try {
      const scrapedResults = await searchTorrents(query);
      const sortedResults = scrapedResults.sort((a, b) => (b.seeds || 0) - (a.seeds || 0));
      setResults(sortedResults);
    } catch (error) {
      showDialog({ title: "Error", message: "Failed to fetch search results.", type: "danger" });
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
    // Extract hash from magnet link
    const match = url.match(/urn:btih:([a-fA-F0-9]{40})/i);
    if (!match) {
      showDialog({ title: "Error", message: "No valid hash found in this magnet link.", type: "danger" });
      return;
    }

    const hash = match[1].toUpperCase();
    const cleanName = fileName.replace(/[^a-z0-9]/gi, '_').substring(0, 60);
    const fileUri = FileSystem.documentDirectory + cleanName + '.torrent';

    // Hit YOUR Vercel backend — it handles the cache fetching server-side
    const torrentUrl = `https://watcher-api-rho.vercel.app/api/torrent-file?hash=${hash}`;

    const downloadRes = await FileSystem.downloadAsync(torrentUrl, fileUri);

    // Validate: real .torrent must be > 40 bytes
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    const fileSize = fileInfo.exists ? (fileInfo as any).size ?? 0 : 0;

    if (downloadRes.status !== 200 || fileSize < 40) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      showDialog({
        title: "Not in Cache",
        message: "This torrent isn't cached yet. Tap 'Open Magnet' to open directly in your torrent client.",
        type: "warning",
      });
      return;
    }

    // Share the real .torrent file
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/x-bittorrent',
        dialogTitle: 'Share .torrent file',
        UTI: 'com.bittorrent.torrent',
      });
    } else {
      showDialog({ title: "Saved", message: `Torrent saved to: ${fileUri}`, type: "success" });
    }

  } catch (error) {
    showDialog({ title: "Error", message: "Failed to fetch torrent file. Try 'Open Magnet' instead.", type: "danger" });
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
               <MaterialCommunityIcons name="file-video" size={30} color="#E50914" />
            </View>
            <View style={styles.cardContent}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
                
                <View style={styles.statsContainer}>
                    <View style={styles.statPill}>
                         <Feather name="arrow-up" size={12} color={healthColor} />
                         <Text style={[styles.statText, { color: healthColor, fontWeight: '700' }]}>{item.seeds}</Text>
                    </View>
                    <View style={styles.statPill}>
                         <Feather name="arrow-down" size={12} color="#888" />
                         <Text style={styles.statText}>{item.peers}</Text>
                    </View>
                    <View style={styles.dot} />
                    <Text style={styles.sizeText}>{item.size}</Text>
                </View>

                <View style={styles.tagsRow}>
                    <View style={[styles.tag, { backgroundColor: quality.color + '20', borderColor: quality.color + '50' }]}>
                        <Text style={[styles.tagText, { color: quality.color }]}>{quality.label}</Text>
                    </View>
                    <View style={styles.tagSource}>
                        <Text style={styles.tagSourceText}>{item.source}</Text>
                    </View>
                </View>
            </View>
          </View>
          
          <View style={styles.actionRow}>
                <TouchableOpacity activeOpacity={0.95} 
                    style={styles.shareBtn} 
                    onPress={() => handleShareAsFile(item.url, item.name)}
                    disabled={downloadingFile}
                >
                    {downloadingFile ? <ActivityIndicator size="small" color="#AAA" /> : <Feather name="download" size={18} color="#AAA" />}
                </TouchableOpacity>

                <TouchableOpacity activeOpacity={0.95} 
                    style={styles.downloadBtn} 
                    onPress={async () => {
                         const supported = await Linking.canOpenURL(item.url);
                         if(supported) await Linking.openURL(item.url);
                         else showDialog({ title: "No App Found", message: "Please install a torrent client like Flud or LibreTorrent to open magnet links.", type: "warning" });
                    }}
                >
                    <MaterialCommunityIcons name="magnet" size={18} color="#FFF" />
                    <Text style={styles.downloadText}>Magnet Link</Text>
                </TouchableOpacity>
          </View>
        </Animated.View>
      );
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <LinearGradient colors={['#0F0F0F', '#000']} style={StyleSheet.absoluteFill} />

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
                <TouchableOpacity activeOpacity={0.95} 
                    onPress={() => router.push("/history")}
                    style={styles.historyPill}
                >
                    <MaterialIcons name="history" size={16} color="#CCC" />
                    <Text style={{ color: '#CCC', fontSize: 12, fontWeight: '600' }}>History</Text>
                </TouchableOpacity>
            </View>
        )}

        <View style={[styles.searchSection, hasSearched && styles.searchSectionActive]}>
            <View style={styles.inputWrapper}>
                {prefillQuery || fromMovieId ? (
                    <TouchableOpacity activeOpacity={0.7} onPress={handleGoBack} style={{ paddingLeft: 14, paddingRight: 4 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Ionicons name="arrow-back" size={22} color="#FFF" />
                    </TouchableOpacity>
                ) : (
                    <Ionicons name="search" size={20} color="#666" style={{ marginLeft: 16 }} />
                )}
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
                    <TouchableOpacity activeOpacity={0.95} onPress={handleClear} style={{ padding: 10 }}>
                        <Ionicons name="close-circle" size={18} color="#666" />
                    </TouchableOpacity>
                )}
            </View>
        </View>

        {hasSearched && (
            <ScrollView 
                contentContainerStyle={styles.scrollContent} 
                showsVerticalScrollIndicator={false}
                keyboardDismissMode="on-drag"
                scrollEventThrottle={16}
                onScroll={(e) => {
                    const y = e.nativeEvent.contentOffset.y;
                    import('react-native').then(({ DeviceEventEmitter }) => {
                        DeviceEventEmitter.emit('exploreScroll', y);
                    });
                }}
            >
                <View style={styles.resultsHeader}>
                     <Text style={styles.resultsTitle}>{loading ? 'Searching...' : `${results.length} Results`}</Text>
                     <TouchableOpacity activeOpacity={0.95} style={styles.historyIconBtn} onPress={() => router.push("/history")}>
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
                            <TouchableOpacity activeOpacity={0.95} onPress={() => setShowMore(!showMore)} style={styles.showMoreBtn}>
                                <Text style={styles.showMoreText}>{showMore ? "Show Less" : "Show More Results"}</Text>
                                <Feather name={showMore ? "chevron-up" : "chevron-down"} size={16} color="#888" />
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </ScrollView>
        )}

      </View>

      {/* ── Themed Dialog & Alert ── */}
      <ThemedDialog
        visible={dialogConfig.visible}
        title={dialogConfig.title}
        message={dialogConfig.message}
        type={dialogConfig.type}
        buttons={dialogConfig.buttons}
        iconName={dialogConfig.iconName}
        onClose={() => setDialogConfig(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  contentWrapper: { flex: 1, width: '100%' },
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
  resultsTitle: { color: 'white', fontSize: 18, fontFamily: 'GoogleSansFlex-Bold' },
  historyIconBtn: { padding: 4 },
  card: { 
      backgroundColor: 'rgba(28, 28, 30, 0.6)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)',
      marginBottom: 16, overflow: 'hidden'
  },
  cardInner: { flexDirection: 'row', padding: 16, alignItems: 'center' },
  iconContainer: {
      width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(229, 9, 20, 0.1)', 
      justifyContent: 'center', alignItems: 'center', marginRight: 16, borderWidth: 1, borderColor: 'rgba(229, 9, 20, 0.2)'
  },
  cardContent: { flex: 1 },
  cardTitle: { color: 'white', fontSize: 15, fontFamily: 'GoogleSansFlex-Bold', marginBottom: 8, lineHeight: 20 },
  statsContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  statPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  statText: { color: '#AAA', fontSize: 12, fontFamily: 'GoogleSansFlex-Medium' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#555' },
  sizeText: { color: '#AAA', fontSize: 12, fontFamily: 'GoogleSansFlex-Medium' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  tagText: { fontSize: 10, fontFamily: 'GoogleSansFlex-Bold' },
  tagSource: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tagSourceText: { color: '#CCC', fontSize: 10, fontFamily: 'GoogleSansFlex-Medium' },
  actionRow: {
      flexDirection: 'row', backgroundColor: 'rgba(0, 0, 0, 0.2)', padding: 12,
      borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.05)', justifyContent: 'space-between', alignItems: 'center'
  },
  shareBtn: { padding: 10, borderRadius: 10, backgroundColor: 'rgba(255, 255, 255, 0.05)', width: 44, alignItems: 'center' },
  downloadBtn: {
      flex: 1, marginLeft: 12, backgroundColor: '#E50914', borderRadius: 10,
      flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 10, gap: 8
  },
  downloadText: { color: 'white', fontFamily: 'GoogleSansFlex-Bold', fontSize: 14 },
  loaderContainer: { marginTop: 50, alignItems: 'center' },
  loadingText: { color: '#666', marginTop: 16 },
  emptyState: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: '#666', fontSize: 16 },
  showMoreBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 20, gap: 8 },
  showMoreText: { color: '#888', fontWeight: '600' },
});