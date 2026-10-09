import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
  Text,
  StatusBar,
  Modal,
  TextInput,
  ActivityIndicator,
  ScrollView,
  DeviceEventEmitter,
  Pressable,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getSavedItems,
  addSavedItem,
  removeSavedItem,
  clearSavedItems,
  subscribeToSavedItemsChanges,
} from '../../src/database';
import { getImageUrl, searchTMDB, GLOBAL_CONFIG, setGlobalConfig } from '../../src/tmdb';
import { isAdultContent } from '../../src/contentSafety';
import { GENRE_OPTIONS } from '../../src/userPreferences';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons, Ionicons, Feather } from '@expo/vector-icons';
import { ThemedDialog, DialogButton } from '../../src/components/shared/ThemedDialog';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeInDown,
} from 'react-native-reanimated';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;
const TAB_WIDTH = width - 148;
const TAB_ITEM_WIDTH = (TAB_WIDTH - 4) / 3;

type SortOption = 'default' | 'rating' | 'year' | 'title';
type FilterMediaType = 'all' | 'movie' | 'tv' | 'collection';

const WatchlistCard = React.memo(({
  item,
  activeTab,
  onRemove,
  onPress,
}: {
  item: any;
  activeTab: number;
  onRemove: (id: number, type: 'watchlist' | 'artist' | 'history') => void;
  onPress: (item: any) => void;
}) => {
  const isArtist = activeTab === 1;
  const imageUrl = !isArtist
    ? getImageUrl(item.poster_path, 'w342')
    : getImageUrl(item.profile_path, 'w342');

  const title = !isArtist ? item.title || item.name : item.name;
  const subtitle = !isArtist ? '' : item.known_for_department || 'Artist';
  const itemType = activeTab === 0 ? 'watchlist' : activeTab === 1 ? 'artist' : 'history';

  return (
    <View style={styles.cardWrapper}>
      <Pressable
        onPress={() => onPress(item)}
        style={({ pressed }) => [styles.cardContainer, pressed && { opacity: 0.85 }]}
      >
        <Image
          source={{ uri: imageUrl }}
          style={styles.cardImage}
          contentFit="cover"
          recyclingKey={imageUrl}
          cachePolicy="memory-disk"
        />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.92)']} style={styles.cardGradient} />
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={styles.cardSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>

        <Pressable
          style={({ pressed }) => [styles.unsaveButton, pressed && { opacity: 0.6 }]}
          onPress={() => onRemove(item.id, itemType)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={styles.unsaveCircle}>
            <Ionicons name="close" size={15} color="#FFF" />
          </View>
        </Pressable>
      </Pressable>
    </View>
  );
}, (prevProps, nextProps) => {
  return prevProps.item.id === nextProps.item.id && prevProps.activeTab === nextProps.activeTab;
});

const WatchListPage = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState(0);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [artists, setArtists] = useState<any[]>([]);
  const [watched, setWatched] = useState<any[]>([]);
  const [nsfwFilterEnabled, setNsfwFilterEnabled] = useState(GLOBAL_CONFIG.nsfwFilterEnabled);
  const [loading, setLoading] = useState(true);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMediaType, setSelectedMediaType] = useState<FilterMediaType>('all');
  const [selectedGenreIds, setSelectedGenreIds] = useState<number[]>([]);

  const headerTranslateYAnim = useSharedValue(0);
  const headerOpacityAnim = useSharedValue(1);

  const animatedHeaderStyle = useAnimatedStyle(() => ({
    opacity: headerOpacityAnim.value,
    transform: [{ translateY: headerTranslateYAnim.value }],
  }));

  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');

  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);
  const [isLinkModalVisible, setIsLinkModalVisible] = useState(false);
  const [syncLinkInput, setSyncLinkInput] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');

  const [importSummary, setImportSummary] = useState<{
    visible: boolean;
    total: number;
    added: number;
    existing: number;
    missed: string[];
  }>({ visible: false, total: 0, added: 0, existing: 0, missed: [] });

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

  const tabPosition = useSharedValue(0);
  const filterTranslateY = useSharedValue(0);
  const filterOpacity = useSharedValue(1);
  const filterScale = useSharedValue(1);
  const scrollTimeout = useRef<NodeJS.Timeout>(null);

  const animatedFilterStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: filterTranslateY.value }, { scale: filterScale.value }],
    opacity: filterOpacity.value,
  }));

  const flatListRef = useRef<FlashList<any>>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem('settings_nsfw').then((raw) => {
      if (active && raw !== null) {
        const enabled = JSON.parse(raw) === true;
        setNsfwFilterEnabled(enabled);
        setGlobalConfig('nsfwFilterEnabled', enabled);
      }
    }).catch(() => {});
    const settingListener = DeviceEventEmitter.addListener('watcher_nsfw_setting_changed', (enabled: boolean) => {
      setNsfwFilterEnabled(enabled);
      setGlobalConfig('nsfwFilterEnabled', enabled);
    });
    return () => { active = false; settingListener.remove(); };
  }, []);

  const loadData = async () => {
    try {
      setWatchlist(getSavedItems('watchlist'));
      setArtists(getSavedItems('artist'));
      setWatched(getSavedItems('history'));
      runDailyAutoSync();
    } catch (error) {
      console.error('Failed to load library data', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  useEffect(() => subscribeToSavedItemsChanges((type) => {
    if (type === 'watchlist') setWatchlist(getSavedItems('watchlist'));
    else if (type === 'artist') setArtists(getSavedItems('artist'));
    else if (type === 'history') setWatched(getSavedItems('history'));
  }), []);

  const runDailyAutoSync = async () => {
    try {
      const url = await AsyncStorage.getItem('sync_url');
      if (!url) return;
      const lastSync = await AsyncStorage.getItem('last_sync_date');
      const today = new Date().toDateString();
      if (lastSync !== today) {
        await triggerExtraction('extract_url', { url }, true);
        await AsyncStorage.setItem('last_sync_date', today);
      }
    } catch (e) {}
  };

  const handleSyncMovies = async (titles: { title: string, year: string | null }[]) => {
    let addedCount = 0;
    let existingCount = 0;
    let missedTitles: string[] = [];

    const currentList = getSavedItems('watchlist');

    for (let i = 0; i < titles.length; i++) {
      setSyncProgress(`Checking ${i + 1}/${titles.length}: ${titles[i].title}`);
      try {
        const results = await searchTMDB(titles[i].title);
        const match = results.find(m => m.poster_path);
        if (match) {
          const exists = currentList.some((item: any) => item.id === match.id);
          if (!exists) {
            currentList.unshift(match);
            addedCount++;
          } else {
            existingCount++;
          }
        } else {
          missedTitles.push(titles[i].title);
        }
      } catch (e) {
        missedTitles.push(titles[i].title);
      }
    }

    currentList.forEach((item: any) => addSavedItem(item, 'watchlist'));
    setWatchlist(currentList);
    setSyncProgress('');
    return { addedCount, existingCount, missedTitles };
  };

  const triggerExtraction = async (action: string, payload: any, silent = false) => {
    setIsImportModalOpen(false);
    if (!silent) {
      setSyncing(true);
      setSyncProgress('Extracting titles...');
    }
    try {
      const response = await axios.post('https://watcher-api-rho.vercel.app/api/gemini', {
        action,
        ...payload,
        customApiKey: GLOBAL_CONFIG.customApiKey,
      });

      if (response.data.results && response.data.results.length > 0) {
        const { addedCount, existingCount, missedTitles } = await handleSyncMovies(response.data.results);
        if (!silent) {
          setImportSummary({
            visible: true,
            total: response.data.results.length,
            added: addedCount,
            existing: existingCount,
            missed: missedTitles,
          });
        }
      } else {
        if (!silent) showDialog({ title: "No movies found", message: "Could not find any readable titles.", type: "warning" });
      }
    } catch (e: any) {
      if (!silent) showDialog({ title: "Sync Failed", message: e.response?.data?.error || e.message || "Failed to sync movies.", type: "danger" });
    } finally {
      if (!silent) {
        setSyncing(false);
        setSyncProgress('');
      }
    }
  };

  const handleAddLink = async () => {
    setIsImportModalOpen(false);
    try {
      const savedUrl = await AsyncStorage.getItem('sync_url');
      setSyncLinkInput(savedUrl || '');
    } catch (e) {}
    setIsLinkModalVisible(true);
  };

  const handleSaveAndSyncLink = async () => {
    const trimmedUrl = syncLinkInput.trim();
    if (!trimmedUrl) {
      showDialog({ title: "Error", message: "Please enter a valid URL.", type: "warning" });
      return;
    }
    setIsLinkModalVisible(false);
    try {
      await AsyncStorage.setItem('sync_url', trimmedUrl);
      triggerExtraction('extract_url', { url: trimmedUrl });
    } catch (e) {}
  };

  const extractMoviesFromText = (text: string) => {
    const lines = text.split('\n');
    const results: { title: string, year: string | null }[] = [];
    const yearRegex = /(?:\s*\(?(\d{4})\)?\s*)$/;

    for (let line of lines) {
      let cleanLine = line.trim();
      if (!cleanLine) continue;

      cleanLine = cleanLine.replace(/^[\d\.\-\*]+\s*/, '');
      const match = cleanLine.match(yearRegex);
      let year = null;
      let title = cleanLine;

      if (match) {
        year = match[1];
        title = cleanLine.replace(yearRegex, '').trim();
        title = title.replace(/[\,\-]\s*$/, '').trim();
      }

      if (title) results.push({ title, year });
    }
    return results;
  };

  const handleImportFile = async () => {
    setIsImportModalOpen(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const fileUri = result.assets[0].uri;
      const response = await fetch(fileUri);
      let text = await response.text();

      if (text.length > 50000) text = text.substring(0, 50000);

      setSyncing(true);
      setSyncProgress('Analyzing file...');

      let extractedMovies: Array<{ title: string; year: string | null }> = [];

      try {
        const parsedJson = JSON.parse(text);
        if (Array.isArray(parsedJson)) {
          extractedMovies = parsedJson.map((item: any) => ({
            title: typeof item === 'string' ? item : item.title || item.name || '',
            year: item.year ? String(item.year) : null,
          })).filter((item: any) => item.title !== '');
        } else if (parsedJson.watchlist && Array.isArray(parsedJson.watchlist)) {
          extractedMovies = parsedJson.watchlist.map((item: any) => ({
            title: typeof item === 'string' ? item : item.title || item.name || '',
            year: item.year ? String(item.year) : null,
          })).filter((item: any) => item.title !== '');
        } else if (parsedJson.title || parsedJson.name) {
          extractedMovies = [{
            title: parsedJson.title || parsedJson.name,
            year: parsedJson.year ? String(parsedJson.year) : null,
          }];
        }
      } catch (jsonError) {
        extractedMovies = extractMoviesFromText(text);
      }

      if (extractedMovies.length === 0) {
        setSyncing(false);
        showDialog({ title: "No movies found", message: "Could not find readable movie titles.", type: "warning" });
        return;
      }

      setSyncProgress(`Matching ${extractedMovies.length} titles on TMDB...`);

      const currentWatchlist = getSavedItems('watchlist');
      let addedCount = 0;
      let existingCount = 0;
      const missedTitles: string[] = [];

      for (let i = 0; i < extractedMovies.length; i++) {
        const item = extractedMovies[i];
        setSyncProgress(`Matching [${i + 1}/${extractedMovies.length}]: ${item.title}`);
        try {
          const searchData = await searchTMDB(item.title);
          const topResult = searchData.results?.[0];

          if (topResult) {
            const alreadyExists = currentWatchlist.some((m: any) => m.id === topResult.id);
            if (!alreadyExists) {
              currentWatchlist.unshift(topResult);
              addedCount++;
            } else {
              existingCount++;
            }
          } else {
            missedTitles.push(item.title);
          }
        } catch (err) {
          missedTitles.push(item.title);
        }
      }

      if (addedCount > 0) {
        currentWatchlist.forEach((item: any) => addSavedItem(item, 'watchlist'));
        setWatchlist(currentWatchlist);
      }

      if (addedCount > 0 || existingCount > 0 || missedTitles.length > 0) {
        setImportSummary({
          visible: true,
          total: extractedMovies.length,
          added: addedCount,
          existing: existingCount,
          missed: missedTitles,
        });
      }
      setSyncing(false);
      setSyncProgress('');
    } catch (e: any) {
      showDialog({ title: "Error Details", message: e.message || "Unknown error occurred.", type: "danger" });
      setSyncing(false);
      setSyncProgress('');
    }
  };

  const handleImportImage = async () => {
    setIsImportModalOpen(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0] || !result.assets[0].base64) return;

      triggerExtraction('extract_image', {
        imageBase64: result.assets[0].base64,
        mimeType: result.assets[0].mimeType || 'image/jpeg',
      });
    } catch (e) {
      showDialog({ title: "Error", message: "Failed to read image.", type: "danger" });
    }
  };

  const handleTabChange = (index: number) => {
    if (activeTab === index) return;
    setActiveTab(index);
    tabPosition.value = withSpring(index * TAB_ITEM_WIDTH, { damping: 15, stiffness: 120 });
    // Instantly resets scroll position to top on tab switch
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const animatedTabStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabPosition.value }],
  }));

  const handleRemove = useCallback((id: number, type: 'watchlist' | 'artist' | 'history') => {
    if (type === 'watchlist') {
      setWatchlist(prev => {
        const newList = prev.filter(item => item.id !== id);
        removeSavedItem(id, 'watchlist');
        return newList;
      });
    } else if (type === 'artist') {
      setArtists(prev => {
        const newList = prev.filter(item => item.id !== id);
        removeSavedItem(id, 'artist');
        return newList;
      });
    } else if (type === 'history') {
      setWatched(prev => {
        const newList = prev.filter(item => item.id !== id);
        removeSavedItem(id, 'history');
        return newList;
      });
    }
  }, []);

  const handleClearAll = () => {
    setIsOptionsMenuOpen(false);
    const tabName = activeTab === 0 ? "Watchlist" : activeTab === 1 ? "Favorite Artists" : "Watch History";
    showDialog({
      title: `Clear ${tabName}`,
      message: `Are you sure you want to delete all items from your ${tabName}? This cannot be undone.`,
      type: 'danger',
      buttons: [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            if (activeTab === 0) { setWatchlist([]); clearSavedItems('watchlist'); }
            if (activeTab === 1) { setArtists([]); clearSavedItems('artist'); }
            if (activeTab === 2) { setWatched([]); clearSavedItems('history'); }
          },
        },
      ],
    });
  };

  const filteredCurrentList = useMemo(() => {
    let list = activeTab === 0
      ? (nsfwFilterEnabled ? watchlist.filter(item => !isAdultContent(item)) : watchlist)
      : activeTab === 1 ? artists : watched;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((item: any) => {
        const title = (item.title || item.name || '').toLowerCase();
        return title.includes(q);
      });
    }

    if (activeTab === 0 || activeTab === 2) {
      if (selectedMediaType === 'movie') {
        list = list.filter((item: any) => item.media_type === 'movie' || (!item.first_air_date && item.media_type !== 'collection' && item.media_type !== 'tv'));
      } else if (selectedMediaType === 'tv') {
        list = list.filter((item: any) => item.media_type === 'tv' || item.first_air_date);
      } else if (selectedMediaType === 'collection') {
        list = list.filter((item: any) => item.media_type === 'collection');
      }
    }

    if (selectedGenreIds.length > 0 && (activeTab === 0 || activeTab === 2)) {
      list = list.filter(item => {
        if (item.genre_ids && Array.isArray(item.genre_ids)) {
          return selectedGenreIds.some(id => item.genre_ids.includes(id));
        }
        if (item.genres && Array.isArray(item.genres)) {
          return selectedGenreIds.some(id => item.genres.some((g: any) => g.id === id));
        }
        return false;
      });
    }

    if (sortBy === 'default') return sortDirection === 'asc' ? [...list].reverse() : list;

    return [...list].sort((a, b) => {
      if (sortBy === 'year') {
        const yearA = new Date(a.release_date || a.first_air_date || 0).getFullYear();
        const yearB = new Date(b.release_date || b.first_air_date || 0).getFullYear();
        return sortDirection === 'desc' ? yearB - yearA : yearA - yearB;
      }
      if (sortBy === 'rating') {
        const ratingA = a.vote_average || 0;
        const ratingB = b.vote_average || 0;
        return sortDirection === 'desc' ? ratingB - ratingA : ratingA - ratingB;
      }
      if (sortBy === 'title') {
        const titleA = (a.title || a.name || '').toLowerCase();
        const titleB = (b.title || b.name || '').toLowerCase();
        return sortDirection === 'desc'
          ? titleB.localeCompare(titleA)
          : titleA.localeCompare(titleB);
      }
      return 0;
    });
  }, [activeTab, watchlist, artists, watched, nsfwFilterEnabled, searchQuery, selectedMediaType, selectedGenreIds, sortBy, sortDirection]);

  const handleCardPress = useCallback((item: any) => {
    if (activeTab === 1 || item.profile_path !== undefined || item.known_for_department) {
      router.push(`/cast/${item.id}`);
    } else if (item.media_type === 'collection') {
      router.push(`/collection/${item.id}?name=${encodeURIComponent(item.name)}`);
    } else if (item.media_type === 'movie' || item.media_type === 'tv' || item.title || item.name) {
      const mType = item.media_type || (item.first_air_date || item.number_of_seasons ? 'tv' : 'movie');
      router.push(`/movie/${item.id}?media_type=${mType}`);
    }
  }, [router, activeTab]);

  const renderCard = useCallback(({ item }: { item: any }) => {
    return (
      <WatchlistCard
        item={item}
        activeTab={activeTab}
        onRemove={handleRemove}
        onPress={handleCardPress}
      />
    );
  }, [activeTab, handleRemove, handleCardPress]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* ── SYNC PROGRESS BANNER ── */}
      {syncing && (
        <View style={styles.syncHubContainer}>
          <View style={styles.syncingOverlay}>
            <ActivityIndicator size="small" color="#E50914" />
            <Text style={styles.syncingText}>{syncProgress}</Text>
          </View>
        </View>
      )}

      {/* ── SINGLE HIGH-PERFORMANCE VIRTUALIZED FLASHLIST ── */}
      {loading && !syncing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator animating={true} size="large" color="#E50914" />
        </View>
      ) : !syncing && filteredCurrentList.length === 0 ? (
        <View style={[styles.emptyContainer, { paddingTop: insets.top + 130 }]}>
          <View style={styles.emptyIconCircle}>
            {activeTab === 0 ? (
              <MaterialIcons name="movie-filter" size={38} color="#E50914" />
            ) : activeTab === 1 ? (
              <Ionicons name="people" size={38} color="#E50914" />
            ) : (
              <Feather name="check-circle" size={38} color="#E50914" />
            )}
          </View>
          <Text style={styles.emptyText}>
            {searchQuery || selectedGenreIds.length > 0 || selectedMediaType !== 'all'
              ? "No matching items found"
              : activeTab === 0
                ? "Watchlist Empty"
                : activeTab === 1
                  ? "No Favorite Artists"
                  : "Nothing Watched Yet"
            }
          </Text>
          <Text style={styles.emptySubtext}>
            {searchQuery || selectedGenreIds.length > 0 || selectedMediaType !== 'all'
              ? "Try adjusting your search or clearing active filters."
              : activeTab === 0
                ? "Tap the bookmark icon on any movie or TV show to save it here."
                : activeTab === 1
                  ? "Favorite cast & directors to easily track their filmographies."
                  : "Titles you finish or mark as watched will appear in this history."
            }
          </Text>
          {activeTab === 0 && !searchQuery && (
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.emptyActionButton}
              onPress={() => setIsImportModalOpen(true)}
            >
              <Feather name="download-cloud" size={16} color="#FFF" />
              <Text style={styles.emptyActionText}>Import Existing Watchlist</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlashList
          ref={flatListRef}
          data={filteredCurrentList}
          extraData={activeTab}
          keyExtractor={(item) => `${activeTab}-${item.id}`}
          renderItem={renderCard}
          numColumns={2}
          estimatedItemSize={CARD_WIDTH * 1.5 + 16}
          contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 115 }]}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            DeviceEventEmitter.emit('exploreScroll', y);

            if (y <= 0 && headerOpacityAnim.value !== 1) {
              headerTranslateYAnim.value = withTiming(0, { duration: 150 });
              headerOpacityAnim.value = withTiming(1, { duration: 150 });
            } else if (y > 20 && headerOpacityAnim.value !== 0) {
              headerTranslateYAnim.value = withTiming(-10, { duration: 250 });
              headerOpacityAnim.value = withTiming(0, { duration: 250 });
            }

            if (y > 30) {
              if (filterTranslateY.value !== 60) {
                filterTranslateY.value = withTiming(60, { duration: 250 });
                filterOpacity.value = withTiming(0, { duration: 250 });
                filterScale.value = withTiming(0.9, { duration: 250 });
              }
              if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
              scrollTimeout.current = setTimeout(() => {
                filterTranslateY.value = withTiming(0, { duration: 250 });
                filterOpacity.value = withTiming(1, { duration: 250 });
                filterScale.value = withTiming(1, { duration: 250 });
              }, 1500);
            } else {
              if (filterTranslateY.value !== 0) {
                filterTranslateY.value = withTiming(0, { duration: 200 });
                filterOpacity.value = withTiming(1, { duration: 200 });
                filterScale.value = withTiming(1, { duration: 200 });
              }
              if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
            }
          }}
        />
      )}

      {/* ── TOP HEADER OVERLAY (SOLID FLAT DESIGN) ── */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + 2, zIndex: 100 }} pointerEvents="box-none">
        <LinearGradient
          colors={['#121212', 'rgba(18, 18, 18, 0.85)', 'transparent']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 160 }}
          pointerEvents="none"
        />

        <Animated.View style={[styles.headerContainer, animatedHeaderStyle]} pointerEvents="box-none">
          <View style={styles.headerTitleRow}>
            <Text style={styles.header}>My Library</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{filteredCurrentList.length}</Text>
            </View>
          </View>
        </Animated.View>

        {/* ── SOLID BORDERLESS TABS ── */}
        <View style={styles.tabWrapper}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              setIsSearchOpen(prev => !prev);
              if (isSearchOpen) setSearchQuery('');
            }}
            style={[styles.headerIconButton, isSearchOpen && styles.headerIconButtonActive]}
          >
            <Ionicons name={isSearchOpen ? "close" : "search"} size={18} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.tabContainer}>
            <Animated.View style={[styles.activePill, animatedTabStyle]} />
            <TouchableOpacity activeOpacity={0.95} style={styles.tabButton} onPress={() => handleTabChange(0)}>
              <Text style={[styles.tabText, activeTab === 0 && styles.activeTabText]}>Watchlist</Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.95} style={styles.tabButton} onPress={() => handleTabChange(1)}>
              <Text style={[styles.tabText, activeTab === 1 && styles.activeTabText]}>Artists</Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.95} style={styles.tabButton} onPress={() => handleTabChange(2)}>
              <Text style={[styles.tabText, activeTab === 2 && styles.activeTabText]}>Watched</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setIsOptionsMenuOpen(true)}
            style={styles.headerIconButton}
          >
            <Feather name="more-vertical" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* ── SOLID BORDERLESS SEARCH BAR ── */}
        {isSearchOpen && (
          <Animated.View entering={FadeInDown.duration(200)} style={styles.searchBarContainer}>
            <Ionicons name="search" size={16} color="#888" style={{ marginLeft: 14 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search library..."
              placeholderTextColor="#777"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 8, marginRight: 4 }}>
                <Ionicons name="close-circle" size={18} color="#999" />
              </TouchableOpacity>
            ) : null}
          </Animated.View>
        )}
      </View>

      {/* ── SOLID BOTTOM FILTER DOCK ── */}
      {(activeTab === 0 || activeTab === 2) && (
        <Animated.View style={[styles.filterSection, { bottom: insets.bottom + 95 }, animatedFilterStyle]} collapsable={false}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: 12 }}
            contentContainerStyle={styles.filterScrollContent}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.filterChip, sortBy !== 'default' && styles.filterChipActive]}
              onPress={() => setIsSortModalOpen(true)}
            >
              <MaterialIcons name="sort" size={16} color={sortBy !== 'default' ? "#FFF" : "#A0A0A0"} />
              <Text style={[styles.filterChipText, sortBy !== 'default' && styles.filterChipTextActive]}>
                {sortBy === 'default' ? 'Sort' : sortBy === 'rating' ? `Rating (${sortDirection.toUpperCase()})` : sortBy === 'year' ? `Year (${sortDirection.toUpperCase()})` : `Title (${sortDirection.toUpperCase()})`}
              </Text>
            </TouchableOpacity>

            <View style={styles.chipDivider} />

            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.filterChip, selectedMediaType === 'all' && styles.filterChipActive]}
              onPress={() => setSelectedMediaType('all')}
            >
              <Text style={[styles.filterChipText, selectedMediaType === 'all' && styles.filterChipTextActive]}>All</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.filterChip, selectedMediaType === 'movie' && styles.filterChipActive]}
              onPress={() => setSelectedMediaType(selectedMediaType === 'movie' ? 'all' : 'movie')}
            >
              <Ionicons name="film-outline" size={14} color={selectedMediaType === 'movie' ? "#FFF" : "#A0A0A0"} />
              <Text style={[styles.filterChipText, selectedMediaType === 'movie' && styles.filterChipTextActive]}>Movies</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.filterChip, selectedMediaType === 'tv' && styles.filterChipActive]}
              onPress={() => setSelectedMediaType(selectedMediaType === 'tv' ? 'all' : 'tv')}
            >
              <Ionicons name="tv-outline" size={14} color={selectedMediaType === 'tv' ? "#FFF" : "#A0A0A0"} />
              <Text style={[styles.filterChipText, selectedMediaType === 'tv' && styles.filterChipTextActive]}>Series</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.filterChip, selectedMediaType === 'collection' && styles.filterChipActive]}
              onPress={() => setSelectedMediaType(selectedMediaType === 'collection' ? 'all' : 'collection')}
            >
              <Ionicons name="albums-outline" size={14} color={selectedMediaType === 'collection' ? "#FFF" : "#A0A0A0"} />
              <Text style={[styles.filterChipText, selectedMediaType === 'collection' && styles.filterChipTextActive]}>Collections</Text>
            </TouchableOpacity>

            <View style={styles.chipDivider} />

            {GENRE_OPTIONS.map(g => {
              const isSelected = selectedGenreIds.includes(g.id);
              return (
                <TouchableOpacity
                  key={g.id}
                  activeOpacity={0.8}
                  style={[styles.filterChip, isSelected && styles.filterChipActive]}
                  onPress={() => {
                    setSelectedGenreIds(prev =>
                      prev.includes(g.id) ? prev.filter(id => id !== g.id) : [...prev, g.id]
                    );
                  }}
                >
                  <Text style={{ fontSize: 13 }}>{g.emoji}</Text>
                  <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                    {g.label}
                  </Text>
                  {isSelected && <Ionicons name="close" size={14} color="#FFF" />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>
      )}

      {/* ── OPTIONS MODAL ── */}
      <Modal visible={isOptionsMenuOpen} transparent={true} animationType="fade" onRequestClose={() => setIsOptionsMenuOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlayDismiss} activeOpacity={1} onPress={() => setIsOptionsMenuOpen(false)} />
          <View style={styles.optionsSheetContainer}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Library Options</Text>

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.sheetItem}
              onPress={() => {
                setIsOptionsMenuOpen(false);
                router.push('/onboarding');
              }}
            >
              <View style={[styles.sheetIconCircle, { backgroundColor: 'rgba(229,9,20,0.15)' }]}>
                <Ionicons name="sparkles" size={18} color="#E50914" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>Change Content Preferences</Text>
                <Text style={styles.sheetItemSub}>Update languages, genres, and favorite actors</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.sheetItem}
              onPress={() => {
                setIsOptionsMenuOpen(false);
                router.push('/stats');
              }}
            >
              <View style={[styles.sheetIconCircle, { backgroundColor: 'rgba(48,209,88,0.15)' }]}>
                <Ionicons name="bar-chart" size={18} color="#30D158" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>View Library Insights</Text>
                <Text style={styles.sheetItemSub}>Explore viewing stats, watch time & breakdown</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.sheetItem}
              onPress={() => {
                setIsOptionsMenuOpen(false);
                setIsSortModalOpen(true);
              }}
            >
              <View style={[styles.sheetIconCircle, { backgroundColor: 'rgba(255,214,10,0.15)' }]}>
                <MaterialIcons name="sort" size={18} color="#FFD60A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>Sort & Arrange</Text>
                <Text style={styles.sheetItemSub}>Sort by rating, release date, or title</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.sheetItem}
              onPress={() => {
                setIsOptionsMenuOpen(false);
                setIsImportModalOpen(true);
              }}
            >
              <View style={[styles.sheetIconCircle, { backgroundColor: 'rgba(10,132,255,0.15)' }]}>
                <Feather name="download-cloud" size={18} color="#0A84FF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>Import Watchlist</Text>
                <Text style={styles.sheetItemSub}>Import from Trakt, Letterboxd, or TMDB</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#666" />
            </TouchableOpacity>

            <View style={styles.sheetDivider} />

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.sheetItem}
              onPress={handleClearAll}
            >
              <View style={[styles.sheetIconCircle, { backgroundColor: 'rgba(255,69,58,0.15)' }]}>
                <Feather name="trash-2" size={18} color="#FF453A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetItemTitle, { color: '#FF453A' }]}>Clear All Items</Text>
                <Text style={styles.sheetItemSub}>Delete all titles from this list</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── SORT MODAL ── */}
      <Modal visible={isSortModalOpen} transparent={true} animationType="fade" onRequestClose={() => setIsSortModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlayDismiss} activeOpacity={1} onPress={() => setIsSortModalOpen(false)} />
          <View style={styles.optionsSheetContainer}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Sort Library</Text>

            {[
              { key: 'default', label: 'Date Added (Default)', icon: 'clock' },
              { key: 'rating', label: 'Rating', icon: 'star' },
              { key: 'year', label: 'Release Year', icon: 'calendar' },
              { key: 'title', label: 'Title (Alphabetical)', icon: 'type' },
            ].map(item => {
              const isSelected = sortBy === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={0.8}
                  style={styles.sheetItem}
                  onPress={() => {
                    setSortBy(item.key as SortOption);
                    setIsSortModalOpen(false);
                  }}
                >
                  <View style={[styles.sheetIconCircle, isSelected && { backgroundColor: 'rgba(229,9,20,0.2)' }]}>
                    <Feather name={item.icon as any} size={18} color={isSelected ? "#E50914" : "#AAA"} />
                  </View>
                  <Text style={[styles.sheetItemTitle, { flex: 1 }, isSelected && { color: '#E50914', fontFamily: 'GoogleSansFlex-Bold' }]}>
                    {item.label}
                  </Text>
                  {isSelected && <Ionicons name="checkmark" size={20} color="#E50914" />}
                </TouchableOpacity>
              );
            })}

            <View style={styles.sheetDivider} />

            <View style={styles.directionRow}>
              <Text style={styles.directionLabel}>Sort Order:</Text>
              <View style={styles.directionButtons}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.directionBtn, sortDirection === 'desc' && styles.directionBtnActive]}
                  onPress={() => setSortDirection('desc')}
                >
                  <Text style={[styles.directionBtnText, sortDirection === 'desc' && styles.directionBtnTextActive]}>Descending ↓</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.directionBtn, sortDirection === 'asc' && styles.directionBtnActive]}
                  onPress={() => setSortDirection('asc')}
                >
                  <Text style={[styles.directionBtnText, sortDirection === 'asc' && styles.directionBtnTextActive]}>Ascending ↑</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── IMPORT MODAL ── */}
      <Modal visible={isImportModalOpen} transparent={true} animationType="fade" onRequestClose={() => setIsImportModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlayDismiss} activeOpacity={1} onPress={() => setIsImportModalOpen(false)} />
          <View style={styles.optionsSheetContainer}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Import Watchlist</Text>

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.sheetItem}
              onPress={handleAddLink}
            >
              <View style={[styles.sheetIconCircle, { backgroundColor: 'rgba(0,122,255,0.15)' }]}>
                <MaterialIcons name="link" size={20} color="#0A84FF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>Sync Google Watchlist Link</Text>
                <Text style={styles.sheetItemSub}>Auto-syncs daily from your public collection URL</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.sheetItem}
              onPress={handleImportFile}
            >
              <View style={[styles.sheetIconCircle, { backgroundColor: 'rgba(48,209,88,0.15)' }]}>
                <Ionicons name="document-text-outline" size={20} color="#30D158" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>Import Text or JSON File</Text>
                <Text style={styles.sheetItemSub}>Load from Letterboxd, IMDb export, or notes file</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.sheetItem}
              onPress={handleImportImage}
            >
              <View style={[styles.sheetIconCircle, { backgroundColor: 'rgba(255,149,0,0.15)' }]}>
                <Feather name="image" size={18} color="#FF9500" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemTitle}>Scan Screenshot with AI</Text>
                <Text style={styles.sheetItemSub}>Extract movie titles directly from a photo</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#666" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* URL Link Modal */}
      <Modal visible={isLinkModalVisible} transparent={true} animationType="fade" onRequestClose={() => setIsLinkModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlayDismiss} activeOpacity={0.95} onPress={() => setIsLinkModalVisible(false)} />
          <View style={styles.modalContentContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Google Watchlist Link</Text>
              <Text style={styles.modalSubtitle}>Paste your public Google Collection/Watchlist URL to sync daily:</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Paste URL here..."
                placeholderTextColor="#777"
                value={syncLinkInput}
                onChangeText={setSyncLinkInput}
                autoFocus={true}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.modalButtonsRow}>
                <TouchableOpacity activeOpacity={0.95} style={[styles.modalButton, styles.modalCancelButton]} onPress={() => setIsLinkModalVisible(false)}>
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.95} style={[styles.modalButton, styles.modalSyncButton]} onPress={handleSaveAndSyncLink}>
                  <Text style={styles.modalSyncButtonText}>Sync Now</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* IMPORT RESULTS MODAL */}
      <Modal visible={importSummary.visible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentContainer}>
            <View style={styles.modalContent}>
              <View style={styles.resultsHeaderRow}>
                <Feather name="check-circle" size={24} color="#4CAF50" />
                <Text style={styles.modalTitle}>Import Complete</Text>
              </View>

              <View style={styles.statsContainer}>
                <Text style={styles.statText}>Found: <Text style={{ color: '#FFF' }}>{importSummary.total}</Text></Text>
                <Text style={styles.statText}>Added: <Text style={{ color: '#4CAF50' }}>{importSummary.added}</Text></Text>
                <Text style={styles.statText}>Already Saved: <Text style={{ color: '#AAA' }}>{importSummary.existing}</Text></Text>
              </View>

              {importSummary.missed.length > 0 && (
                <View style={styles.missedContainer}>
                  <Text style={styles.missedTitle}>Could not find ({importSummary.missed.length}):</Text>
                  <ScrollView style={styles.missedScroll} nestedScrollEnabled={true}>
                    {importSummary.missed.map((title, idx) => (
                      <Text key={idx} style={styles.missedText}>• {title}</Text>
                    ))}
                  </ScrollView>
                </View>
              )}

              <TouchableOpacity
                activeOpacity={0.95}
                style={[styles.modalButton, styles.modalSyncButton, { width: '100%', marginTop: 20 }]}
                onPress={() => setImportSummary({ ...importSummary, visible: false })}
              >
                <Text style={styles.modalSyncButtonText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmation & Alerts */}
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
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },

  // Header
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    overflow: 'hidden',
  },
  headerTitleRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 8 },
  header: { color: '#FFF', fontSize: 26, fontFamily: 'GoogleSansFlex-Bold', letterSpacing: -0.5 },
  countBadge: { backgroundColor: '#1C1C1E', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countBadgeText: { color: '#888', fontSize: 13, fontFamily: 'GoogleSansFlex-Bold' },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIconButtonActive: {
    backgroundColor: '#E50914',
  },

  // Search Bar (Solid & Borderless)
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 22,
    backgroundColor: '#1C1C1E',
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'GoogleSansFlex-Regular',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },

  // Tabs (Solid & Borderless)
  tabWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 6,
    gap: 8,
  },
  tabContainer: {
    flexDirection: 'row',
    width: TAB_WIDTH,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1C1C1E',
    position: 'relative',
    overflow: 'hidden',
  },
  activePill: {
    position: 'absolute',
    width: TAB_ITEM_WIDTH,
    top: 2,
    bottom: 2,
    left: 2,
    backgroundColor: '#E50914',
    borderRadius: 20,
  },
  tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  tabText: { color: '#888', fontFamily: 'GoogleSansFlex-Medium', fontSize: 13 },
  activeTabText: { color: '#FFF', fontFamily: 'GoogleSansFlex-Bold' },

  // Filters (Solid Dock, Borderless)
  filterSection: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 44,
    marginHorizontal: 16,
    borderRadius: 22,
    backgroundColor: '#1C1C1E',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    justifyContent: 'center',
  },
  filterScrollContent: { alignItems: 'center', gap: 6 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterChipActive: {
    backgroundColor: '#E50914',
  },
  filterChipText: {
    color: '#A0A0A0',
    fontSize: 13,
    fontFamily: 'GoogleSansFlex-Medium',
  },
  filterChipTextActive: {
    color: '#FFF',
    fontFamily: 'GoogleSansFlex-Bold',
  },
  chipDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 2,
  },

  // Sync Progress
  syncHubContainer: { paddingHorizontal: 16, marginBottom: 15 },
  syncingOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 10,
  },
  syncingText: { color: '#FFF', fontSize: 13, fontFamily: 'GoogleSansFlex-Medium' },

  // Grid
  listContent: { paddingHorizontal: 16, paddingBottom: 110 },
  cardWrapper: { width: CARD_WIDTH, marginBottom: 16, marginHorizontal: 5 },
  cardContainer: {
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
    overflow: 'hidden',
    height: CARD_WIDTH * 1.5,
    position: 'relative',
  },
  cardImage: { width: '100%', height: '100%', backgroundColor: '#222' },
  cardGradient: { position: 'absolute', left: 0, right: 0, bottom: -2, height: '55%', zIndex: 1 },
  cardContent: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, zIndex: 2 },
  cardTitle: { color: '#FFF', fontSize: 11.5, fontFamily: 'GoogleSansFlex-Bold', marginBottom: 2 },
  cardSubtitle: { color: '#FFD700', fontSize: 10, fontFamily: 'GoogleSansFlex-Medium' },
  unsaveButton: { position: 'absolute', top: 6, right: 6, zIndex: 10, borderRadius: 15 },
  unsaveCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },

  // Empty State
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(229,9,20,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: { color: '#FFF', fontSize: 18, fontFamily: 'GoogleSansFlex-Bold', marginBottom: 6, textAlign: 'center' },
  emptySubtext: { color: '#777', fontSize: 13, fontFamily: 'GoogleSansFlex-Regular', textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  emptyActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E50914',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyActionText: { color: '#FFF', fontSize: 13, fontFamily: 'GoogleSansFlex-Bold' },

  // Bottom Sheets & Modals (Borderless)
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.75)' },
  modalOverlayDismiss: { ...StyleSheet.absoluteFill },
  optionsSheetContainer: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#333', alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { color: '#FFF', fontSize: 18, fontFamily: 'GoogleSansFlex-Bold', marginBottom: 16 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  sheetIconCircle: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  sheetItemTitle: { color: '#FFF', fontSize: 15, fontFamily: 'GoogleSansFlex-Medium' },
  sheetItemSub: { color: '#777', fontSize: 12, fontFamily: 'GoogleSansFlex-Regular', marginTop: 2 },
  sheetDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 8 },

  directionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  directionLabel: { color: '#AAA', fontSize: 13, fontFamily: 'GoogleSansFlex-Medium' },
  directionButtons: { flexDirection: 'row', gap: 8 },
  directionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: '#2A2A2A' },
  directionBtnActive: { backgroundColor: '#E50914' },
  directionBtnText: { color: '#888', fontSize: 12, fontFamily: 'GoogleSansFlex-Medium' },
  directionBtnTextActive: { color: '#FFF', fontFamily: 'GoogleSansFlex-Bold' },

  // Link & Summary Modal
  modalContentContainer: {
    width: '88%',
    alignSelf: 'center',
    marginBottom: 'auto',
    marginTop: 'auto',
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    overflow: 'hidden',
  },
  modalContent: { padding: 24, alignItems: 'center' },
  modalTitle: { color: '#FFF', fontSize: 18, fontFamily: 'GoogleSansFlex-Bold', marginBottom: 8 },
  modalSubtitle: { color: '#AAA', fontSize: 13, fontFamily: 'GoogleSansFlex-Regular', textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  modalInput: {
    width: '100%',
    backgroundColor: '#121212',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'GoogleSansFlex-Regular',
    marginBottom: 20,
  },
  modalButtonsRow: { flexDirection: 'row', width: '100%', gap: 12 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalCancelButton: { backgroundColor: '#2A2A2A' },
  modalCancelButtonText: { color: '#AAA', fontSize: 14, fontFamily: 'GoogleSansFlex-Medium' },
  modalSyncButton: { backgroundColor: '#E50914' },
  modalSyncButtonText: { color: '#FFF', fontSize: 14, fontFamily: 'GoogleSansFlex-Medium' },

  resultsHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 15 },
  statsContainer: { width: '100%', backgroundColor: '#121212', borderRadius: 12, padding: 15, marginBottom: 15 },
  statText: { color: '#888', fontSize: 14, fontFamily: 'GoogleSansFlex-Medium', marginBottom: 4 },
  missedContainer: { width: '100%', backgroundColor: 'rgba(229, 9, 20, 0.1)', borderRadius: 12, padding: 12 },
  missedTitle: { color: '#E50914', fontSize: 13, fontFamily: 'GoogleSansFlex-Bold', marginBottom: 8 },
  missedScroll: { maxHeight: 120 },
  missedText: { color: '#CCC', fontSize: 12, fontFamily: 'GoogleSansFlex-Regular', marginBottom: 4 },
});

export default WatchListPage;