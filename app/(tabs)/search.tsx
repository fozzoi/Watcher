import React, { useState, useEffect, useCallback } from "react";
import { 
  View, StyleSheet, Linking, StatusBar, 
  ScrollView, TouchableOpacity, TextInput, 
  Keyboard, ActivityIndicator, Text, BackHandler,
  LayoutAnimation, Platform, UIManager, Dimensions,
  ToastAndroid
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

// Legacy import for Expo 50+ (fixes deprecation warning)
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing"; 
import * as Clipboard from "expo-clipboard";
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
  const [downloadingHash, setDownloadingHash] = useState<string | null>(null);

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
  const getQualityInfo = (name: string): { label: string; color: string; bg: string } => {
    const lower = name.toLowerCase();
    if (lower.includes('2160p') || lower.includes('4k')) {
      return { label: '4K UHD', color: '#22C55E', bg: 'rgba(34, 197, 94, 0.15)' };
    }
    if (lower.includes('1080p')) {
      return { label: '1080p FHD', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)' };
    }
    if (lower.includes('720p')) {
      return { label: '720p HD', color: '#F97316', bg: 'rgba(249, 115, 22, 0.15)' };
    }
    return { label: 'SD', color: '#9CA3AF', bg: 'rgba(156, 163, 175, 0.15)' };
  };

  const handleCopyMagnet = async (magnetUrl: string) => {
    await Clipboard.setStringAsync(magnetUrl);
    if (Platform.OS === 'android') {
      ToastAndroid.show('Magnet link copied to clipboard!', ToastAndroid.SHORT);
    } else {
      showDialog({ title: 'Copied', message: 'Magnet link copied to clipboard!', type: 'success' });
    }
  };

  const handleOpenMagnet = async (magnetUrl: string) => {
    try {
      const supported = await Linking.canOpenURL(magnetUrl);
      if (supported) {
        await Linking.openURL(magnetUrl);
      } else {
        await Clipboard.setStringAsync(magnetUrl);
        if (Platform.OS === 'android') {
          ToastAndroid.show('Magnet copied! Please install a torrent client like Flud.', ToastAndroid.LONG);
        } else {
          showDialog({
            title: 'No App Found',
            message: 'Please install a torrent client like Flud or LibreTorrent to open magnet links.',
            type: 'warning',
          });
        }
      }
    } catch {
      await Clipboard.setStringAsync(magnetUrl);
      showDialog({ title: 'Copied', message: 'Magnet link copied to clipboard!', type: 'success' });
    }
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
    } catch (error: any) {
      if (error.message && error.message.includes("NSFW")) {
        showDialog({ title: "Content Blocked", message: error.message, type: "danger" });
      } else {
        showDialog({ title: "Search Unavailable", message: error.message || "Failed to fetch search results.", type: "danger" });
      }
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
    const match = url.match(/urn:btih:([a-fA-F0-9]{40})/i);
    if (!match) {
      showDialog({ title: "Error", message: "No valid hash found in this magnet link.", type: "danger" });
      return;
    }

    const hash = match[1].toUpperCase();
    setDownloadingHash(hash);
    setDownloadingFile(true);
    try {
      const cleanName = fileName.replace(/[^a-z0-9]/gi, '_').substring(0, 60);
      const FS = FileSystem as any;
      const fileUri = `${FS.documentDirectory || FS.cacheDirectory}${cleanName}.torrent`;

      // Hit YOUR Vercel backend — it handles the cache fetching server-side
      const torrentUrl = `https://watcher-api-rho.vercel.app/api/torrent-file?hash=${hash}`;

      const downloadRes = await FS.downloadAsync(torrentUrl, fileUri);

      // Validate: real .torrent must be > 40 bytes
      const fileInfo = await FS.getInfoAsync(fileUri);
      const fileSize = fileInfo.exists ? (fileInfo as any).size ?? 0 : 0;

      if (downloadRes.status !== 200 || fileSize < 40) {
        await FS.deleteAsync(fileUri, { idempotent: true });
        showDialog({
          title: "Not in Cache",
          message: "This torrent isn't cached yet. Tap 'Magnet' to open directly in your torrent client.",
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
      showDialog({ title: "Error", message: "Failed to fetch torrent file. Try 'Magnet' instead.", type: "danger" });
    } finally {
      setDownloadingHash(null);
      setDownloadingFile(false);
    }
  };

  const renderResults = () => {
    const visibleResults = showMore ? results : results.slice(0, 5);
    
    return visibleResults.map((item, index) => {
      const quality = getQualityInfo(item.name);
      const seedsCount = item.seeds || 0;
      let seedColor = '#E50914'; 
      if (seedsCount > 40) seedColor = '#30D158'; 
      else if (seedsCount > 10) seedColor = '#FFD60A'; 

      const match = item.url.match(/urn:btih:([a-fA-F0-9]{40})/i);
      const hash = match ? match[1].toUpperCase() : null;
      const isDownloadingThis = downloadingHash === hash;

      return (
        <Animated.View key={index} entering={FadeInUp.delay(index * 60).springify()} style={styles.card}>
          {/* Top Row: Quality badge & Source */}
          <View style={styles.cardHeader}>
            <View style={[styles.qualityBadge, { backgroundColor: quality.bg, borderColor: quality.color + '40' }]}>
              <Text style={[styles.qualityText, { color: quality.color }]}>{quality.label}</Text>
            </View>
            {item.source ? (
              <View style={styles.sourceBadge}>
                <Text style={styles.sourceText}>{item.source}</Text>
              </View>
            ) : null}
          </View>

          {/* Torrent Title */}
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.name}
          </Text>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statPill}>
              <Feather name="arrow-up" size={12} color={seedColor} />
              <Text style={[styles.statValue, { color: seedColor }]}>{seedsCount} Seeds</Text>
            </View>

            <View style={styles.statPill}>
              <Feather name="arrow-down" size={12} color="#888" />
              <Text style={styles.statValue}>{item.peers || 0} Peers</Text>
            </View>

            <View style={styles.dotSeparator} />

            <View style={styles.statPill}>
              <MaterialCommunityIcons name="harddisk" size={12} color="#A8A8B6" />
              <Text style={styles.sizeText}>{item.size}</Text>
            </View>
          </View>

          {/* Action Buttons Row */}
          <View style={styles.cardActionsRow}>
            {/* Share .torrent file button */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.shareFileBtn}
              onPress={() => handleShareAsFile(item.url, item.name)}
              disabled={isDownloadingThis}
            >
              {isDownloadingThis ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Feather name="share-2" size={15} color="#E5E5EB" style={{ marginRight: 6 }} />
                  <Text style={styles.shareFileText}>Share .torrent</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Copy Magnet Link Icon Button */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.copyMagnetBtn}
              onPress={() => handleCopyMagnet(item.url)}
            >
              <Feather name="copy" size={15} color="#A8A8B6" />
            </TouchableOpacity>

            {/* Primary Open Magnet Button */}
            <TouchableOpacity
              activeOpacity={0.88}
              style={styles.openMagnetBtn}
              onPress={() => handleOpenMagnet(item.url)}
            >
              <MaterialCommunityIcons name="magnet" size={17} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.openMagnetText}>Magnet</Text>
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
    backgroundColor: '#151518',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#282832',
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  qualityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  qualityText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  sourceBadge: {
    backgroundColor: '#1E1E24',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sourceText: {
    color: '#A8A8B6',
    fontSize: 10.5,
    fontWeight: '600',
  },
  cardTitle: {
    color: '#FAFAFA',
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#A8A8B6',
  },
  dotSeparator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#555',
  },
  sizeText: {
    color: '#FAFAFA',
    fontSize: 11.5,
    fontWeight: '700',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareFileBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E1E24',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#282832',
  },
  shareFileText: {
    color: '#E5E5EB',
    fontSize: 12,
    fontWeight: '600',
  },
  copyMagnetBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E1E24',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#282832',
  },
  openMagnetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E50914',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  openMagnetText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  loaderContainer: { marginTop: 50, alignItems: 'center' },
  loadingText: { color: '#666', marginTop: 16 },
  emptyState: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: '#666', fontSize: 16 },
  showMoreBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 20, gap: 8 },
  showMoreText: { color: '#888', fontWeight: '600' },
});