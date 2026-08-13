import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
  Text,
  Platform,
  Image,
  StatusBar,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getImageUrl, searchTMDB, GLOBAL_CONFIG } from '../src/tmdb';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons, Ionicons, Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring
} from 'react-native-reanimated';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 32) / 3; 
const TAB_WIDTH = width - 40;
const TAB_ITEM_WIDTH = (TAB_WIDTH - 4) / 3;

const WatchListPage = () => {
  const [activeTab, setActiveTab] = useState(0); 
  
  const [watchlist, setWatchlist] = useState<any[]>([]); 
  const [artists, setArtists] = useState<any[]>([]);   
  const [watched, setWatched] = useState<any[]>([]); 
  
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  
  // UI Toggle States
  const [isLinkModalVisible, setIsLinkModalVisible] = useState(false);
  const [syncLinkInput, setSyncLinkInput] = useState('');
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState('default'); 
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc'); // New direction state
  
  // Custom Alert State
  const [importSummary, setImportSummary] = useState({
      visible: false,
      total: 0,
      added: 0,
      existing: 0,
      missed: [] as string[]
  });
  
  const navigation = useNavigation<any>();
  const tabPosition = useSharedValue(0);
  const flatListRef = useRef<FlatList>(null);

  const loadData = async () => {
    try {
      const storedMovies = await AsyncStorage.getItem('watchlist');
      const storedArtists = await AsyncStorage.getItem('favoriteArtists');
      const storedWatched = await AsyncStorage.getItem('history'); 
      
      if (storedMovies) setWatchlist(JSON.parse(storedMovies));
      if (storedArtists) setArtists(JSON.parse(storedArtists));
      if (storedWatched) setWatched(JSON.parse(storedWatched));
      
      runDailyAutoSync();
    } catch (error) {
      console.error('Failed to load library data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeData = async () => {
      setLoading(true);
      await loadData();
      if (!isMounted) return;
      setLoading(false);
    };

    initializeData();

    const unsubscribe = navigation.addListener('focus', () => {
      loadData();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [navigation]);

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
    } catch(e) {}
  };

  const handleSyncMovies = async (titles: {title: string, year: string | null}[]) => {
    let addedCount = 0;
    let existingCount = 0;
    let missedTitles: string[] = [];
    
    const stored = await AsyncStorage.getItem('watchlist'); 
    let currentList = stored ? JSON.parse(stored) : []; 

    for (let i = 0; i < titles.length; i++) {
        setSyncProgress(`Checking ${i+1}/${titles.length}: ${titles[i].title}`);
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
        } catch(e) {
            missedTitles.push(titles[i].title);
        }
    }
    
    await AsyncStorage.setItem('watchlist', JSON.stringify(currentList));
    setWatchlist(currentList);
    setSyncProgress('');
    return { addedCount, existingCount, missedTitles };
  };

  const triggerExtraction = async (action: string, payload: any, silent = false) => {
    setIsImportMenuOpen(false);
    if (!silent) {
        setSyncing(true);
        setSyncProgress('Extracting with AI...');
    }
    try {
        const response = await axios.post('https://watcher-api-rho.vercel.app/api/gemini', {
            action,
            ...payload,
            customApiKey: GLOBAL_CONFIG.customApiKey
        });
        
        if (response.data.results && response.data.results.length > 0) {
            const { addedCount, existingCount, missedTitles } = await handleSyncMovies(response.data.results);
            if (!silent) {
                setImportSummary({
                    visible: true,
                    total: response.data.results.length,
                    added: addedCount,
                    existing: existingCount,
                    missed: missedTitles
                });
            }
        } else {
            if (!silent) Alert.alert("No movies found", "The AI couldn't find any movie titles.");
        }
    } catch (e: any) {
        if (!silent) Alert.alert("Sync Failed", e.response?.data?.error || e.message);
    } finally {
        if (!silent) {
            setSyncing(false);
            setSyncProgress('');
        }
    }
  };

  const handleAddLink = async () => {
    setIsImportMenuOpen(false);
    try {
        const savedUrl = await AsyncStorage.getItem('sync_url');
        setSyncLinkInput(savedUrl || '');
    } catch (e) {}
    setIsLinkModalVisible(true);
  };

  const handleSaveAndSyncLink = async () => {
    const trimmedUrl = syncLinkInput.trim();
    if (!trimmedUrl) {
        Alert.alert("Error", "Please enter a valid URL.");
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
    setIsImportMenuOpen(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', 
        copyToCacheDirectory: true
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
            title: item.title || item.name || '',
            year: item.year ? String(item.year) : null
          })).filter((item: any) => item.title !== '');
        } else if (parsedJson.title || parsedJson.name) {
          extractedMovies = [{ 
            title: parsedJson.title || parsedJson.name, 
            year: parsedJson.year ? String(parsedJson.year) : null 
          }];
        }
      } catch (jsonError) {
        setSyncProgress('Parsing text file locally...');
        extractedMovies = extractMoviesFromText(text);
      }

      if (extractedMovies.length > 0) {
        const { addedCount, existingCount, missedTitles } = await handleSyncMovies(extractedMovies);
        setImportSummary({
            visible: true,
            total: extractedMovies.length,
            added: addedCount,
            existing: existingCount,
            missed: missedTitles
        });
      } else {
        Alert.alert("No movies found", "Could not detect any valid movie titles.");
      }

    } catch (e: any) {
      Alert.alert("Error Details", e.message || "Unknown error occurred while reading the file.");
      console.error(e);
    } finally {
      setSyncing(false);
      setSyncProgress('');
    }
  };

  const handleImportImage = async () => {
    setIsImportMenuOpen(false);
    try {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            base64: true,
            quality: 0.8
        });
        
        if (result.canceled || !result.assets[0] || !result.assets[0].base64) return;
        
        triggerExtraction('extract_image', { 
            imageBase64: result.assets[0].base64,
            mimeType: result.assets[0].mimeType || 'image/jpeg'
        });
    } catch (e) {
        Alert.alert("Error", "Failed to read image.");
    }
  };

  const handleTabChange = (index: number) => {
    setActiveTab(index);
    setIsImportMenuOpen(false);
    setIsSortMenuOpen(false);
    tabPosition.value = withSpring(index * TAB_ITEM_WIDTH, { damping: 15, stiffness: 120 });
  };

  const animatedTabStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabPosition.value }]
  }));

  const handleRemove = async (id: number, type: 'watchlist' | 'artist' | 'history') => {
    if (type === 'watchlist') {
        const newList = watchlist.filter(item => item.id !== id);
        setWatchlist(newList);
        await AsyncStorage.setItem('watchlist', JSON.stringify(newList));
    } else if (type === 'artist') {
        const newList = artists.filter(item => item.id !== id);
        setArtists(newList);
        await AsyncStorage.setItem('favoriteArtists', JSON.stringify(newList));
    } else if (type === 'history') {
        const newList = watched.filter(item => item.id !== id);
        setWatched(newList);
        await AsyncStorage.setItem('history', JSON.stringify(newList)); 
    }
  };

  const handleClearAll = () => {
    Alert.alert(
        "Clear All",
        "Are you sure you want to delete everything in this list?",
        [
            { text: "Cancel", style: "cancel" },
            { 
                text: "Delete All", 
                style: "destructive", 
                onPress: async () => {
                    if (activeTab === 0) { setWatchlist([]); await AsyncStorage.removeItem('watchlist'); }
                    if (activeTab === 1) { setArtists([]); await AsyncStorage.removeItem('favoriteArtists'); }
                    if (activeTab === 2) { setWatched([]); await AsyncStorage.removeItem('history'); }
                } 
            }
        ]
    );
  };

  const getSortedData = () => {
    let list = activeTab === 0 ? watchlist : activeTab === 1 ? artists : watched;
    if (sortBy === 'default') return list;

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
        if (sortBy === 'type') {
            const typeA = a.media_type || 'movie';
            const typeB = b.media_type || 'movie';
            // Ascending (A-Z) vs Descending (Z-A)
            return sortDirection === 'desc' 
                ? typeB.localeCompare(typeA) 
                : typeA.localeCompare(typeB);
        }
        return 0;
    });
  };

  const renderCard = ({ item }: { item: any }) => {
    const isArtist = activeTab === 1;
    const imageUrl = !isArtist 
        ? getImageUrl(item.poster_path, 'w342') 
        : getImageUrl(item.profile_path, 'w342');
    
    const title = !isArtist ? (item.title || item.name) : item.name;
    const subtitle = !isArtist 
        ? (item.vote_average ? `★ ${item.vote_average.toFixed(1)}` : '') 
        : (item.known_for_department || 'Artist');

    const itemType = activeTab === 0 ? 'watchlist' : activeTab === 1 ? 'artist' : 'history';

    return (
      <View style={styles.cardWrapper}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
             if (!isArtist) navigation.navigate('Detail', { movie: item });
             else navigation.navigate('CastDetails', { personId: item.id });
          }}
          style={styles.cardContainer}
        >
            <Image source={{ uri: imageUrl }} style={styles.cardImage} resizeMode="cover" />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.9)']} style={styles.cardGradient} />
            <View style={styles.cardContent}>
                <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
                <Text style={styles.cardSubtitle} numberOfLines={1}>{subtitle}</Text>
            </View>

            <TouchableOpacity 
                style={styles.unsaveButton}
                onPress={() => handleRemove(item.id, itemType)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
                <BlurView intensity={40} tint="dark" style={styles.unsaveBlur}>
                    <Ionicons name="close" size={16} color="#FFF" />
                </BlurView>
            </TouchableOpacity>
        </TouchableOpacity>
      </View>
    );
  };

  const displayList = getSortedData();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.headerContainer}>
        <Text style={styles.header}>
            My Library <Text style={styles.headerCount}>({displayList.length})</Text>
        </Text>
      </View>

      <View style={styles.tabWrapper}>
        <View style={styles.tabContainer}>
            <View style={styles.blurContainer}>
                <BlurView intensity={Platform.OS === 'android' ? 20 : 50} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={{...StyleSheet.absoluteFill, backgroundColor: 'rgba(30,30,30,0.4)'}} />
            </View>

            <Animated.View style={[styles.activePill, animatedTabStyle]} />
            
            <TouchableOpacity style={styles.tabButton} onPress={() => handleTabChange(0)}>
                <Text style={[styles.tabText, activeTab === 0 && styles.activeTabText]}>Watchlist</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.tabButton} onPress={() => handleTabChange(1)}>
                <Text style={[styles.tabText, activeTab === 1 && styles.activeTabText]}>Artists</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.tabButton} onPress={() => handleTabChange(2)}>
                <Text style={[styles.tabText, activeTab === 2 && styles.activeTabText]}>Watched</Text>
            </TouchableOpacity>
        </View>
      </View>

      {/* TOOLBAR WRAPPER (Z-Index fix for overlay) */}
      <View style={styles.toolbarWrapper}>
          <View style={styles.toolbarContainer}>
              {activeTab === 0 && (
                  <View style={styles.toolbarLeft}>
                      <TouchableOpacity style={styles.iconButton} onPress={() => { setIsImportMenuOpen(!isImportMenuOpen); setIsSortMenuOpen(false); }}>
                          <Feather name="file-plus" size={20} color={isImportMenuOpen ? "#E50914" : "#FFF"} />
                          <Text style={styles.iconButtonText}>Import</Text>
                      </TouchableOpacity>
                  </View>
              )}
              <View style={{ flex: 1 }} />
              <View style={styles.toolbarRight}>
                  {/* Sort Direction Toggle Button */}
                  {sortBy !== 'default' && (
                      <TouchableOpacity 
                          style={styles.iconButton} 
                          onPress={() => setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc')}
                      >
                          <Feather name={sortDirection === 'desc' ? "arrow-down" : "arrow-up"} size={16} color="#FFF" />
                      </TouchableOpacity>
                  )}
                  
                  <TouchableOpacity style={styles.iconButton} onPress={() => { setIsSortMenuOpen(!isSortMenuOpen); setIsImportMenuOpen(false); }}>
                      <MaterialIcons name="sort" size={20} color={isSortMenuOpen ? "#E50914" : "#FFF"} />
                      <Text style={styles.iconButtonText}>Sort</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconButton} onPress={handleClearAll}>
                      <Feather name="trash-2" size={18} color="#FF4444" />
                  </TouchableOpacity>
              </View>
          </View>

          {/* ABSOLUTE DROPDOWN MENUS (Overlay Fix) */}
          {isImportMenuOpen && activeTab === 0 && (
              <View style={[styles.dropdownMenu, styles.dropdownLeft]}>
                  <TouchableOpacity style={styles.dropdownItem} onPress={handleAddLink}>
                      <MaterialIcons name="link" size={18} color="#FFF" />
                      <Text style={styles.dropdownText}>Sync Link</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dropdownItem} onPress={handleImportFile}>
                      <Ionicons name="document-text-outline" size={18} color="#FFF" />
                      <Text style={styles.dropdownText}>Import Text/JSON File</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dropdownItem} onPress={handleImportImage}>
                      <Feather name="image" size={18} color="#FFF" />
                      <Text style={styles.dropdownText}>Scan Picture</Text>
                  </TouchableOpacity>
              </View>
          )}

          {isSortMenuOpen && (
              <View style={[styles.dropdownMenu, styles.dropdownRight, { alignItems: 'flex-end' }]}>
                  <TouchableOpacity style={styles.dropdownItem} onPress={() => { setSortBy('default'); setIsSortMenuOpen(false); }}>
                      <Text style={[styles.dropdownText, sortBy === 'default' && styles.activeDropdownText]}>Date Added</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dropdownItem} onPress={() => { setSortBy('year'); setIsSortMenuOpen(false); }}>
                      <Text style={[styles.dropdownText, sortBy === 'year' && styles.activeDropdownText]}>Release Year</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dropdownItem} onPress={() => { setSortBy('rating'); setIsSortMenuOpen(false); }}>
                      <Text style={[styles.dropdownText, sortBy === 'rating' && styles.activeDropdownText]}>Rating</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dropdownItem} onPress={() => { setSortBy('type'); setIsSortMenuOpen(false); }}>
                      <Text style={[styles.dropdownText, sortBy === 'type' && styles.activeDropdownText]}>Movie / TV Show</Text>
                  </TouchableOpacity>
              </View>
          )}
      </View>

      {syncing && (
          <View style={styles.syncHubContainer}>
              <View style={styles.syncingOverlay}>
                  <ActivityIndicator size="small" color="#E50914" />
                  <Text style={styles.syncingText}>{syncProgress}</Text>
              </View>
          </View>
      )}

      {loading && !syncing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator animating={true} size="large" color="#E50914" />
        </View>
      ) : !syncing && displayList.length === 0 ? (
        <View style={styles.emptyContainer}>
          {activeTab === 0 ? (
             <MaterialIcons name="movie-filter" size={60} color="#333" />
          ) : activeTab === 1 ? (
             <Ionicons name="people" size={60} color="#333" />
          ) : (
             <Feather name="check-circle" size={60} color="#333" />
          )}
          <Text style={styles.emptyText}>
             {activeTab === 0 ? "Watchlist Empty" : activeTab === 1 ? "No Favorites" : "Nothing Watched"}
          </Text>
          <Text style={styles.emptySubtext}>
             {activeTab === 0 ? "Movies you save will appear here."  : activeTab === 1 ? "Artists you love will appear here." : "Movies you mark as watched will appear here."}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={displayList}
          keyExtractor={(item) => `${activeTab}-${item.id}`}
          renderItem={renderCard}
          numColumns={3}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={{ gap: 10 }}
        />
      )}

      {/* URL Link Modal */}
      <Modal visible={isLinkModalVisible} transparent={true} animationType="fade" onRequestClose={() => setIsLinkModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlayDismiss} activeOpacity={1} onPress={() => setIsLinkModalVisible(false)} />
          <View style={styles.modalContentContainer}>
            <BlurView intensity={Platform.OS === 'android' ? 25 : 60} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={{ ...StyleSheet.absoluteFill, backgroundColor: 'rgba(30,30,30,0.65)' }} />
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Google Watchlist Link</Text>
              <Text style={styles.modalSubtitle}>Paste your public Google Collection/Watchlist URL to sync daily:</Text>
              <TextInput
                style={styles.modalInput} placeholder="Paste URL here..." placeholderTextColor="#777"
                value={syncLinkInput} onChangeText={setSyncLinkInput} autoFocus={true} keyboardType="url" autoCapitalize="none" autoCorrect={false}
              />
              <View style={styles.modalButtonsRow}>
                <TouchableOpacity style={[styles.modalButton, styles.modalCancelButton]} onPress={() => setIsLinkModalVisible(false)}>
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.modalSyncButton]} onPress={handleSaveAndSyncLink}>
                  <Text style={styles.modalSyncButtonText}>Sync Now</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* CUSTOM THEMED IMPORT RESULTS MODAL */}
      <Modal visible={importSummary.visible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentContainer}>
            <BlurView intensity={Platform.OS === 'android' ? 25 : 60} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={{ ...StyleSheet.absoluteFill, backgroundColor: 'rgba(30,30,30,0.85)' }} />
            <View style={styles.modalContent}>
              <View style={styles.resultsHeaderRow}>
                <Feather name="check-circle" size={24} color="#4CAF50" />
                <Text style={styles.modalTitle}>Import Complete</Text>
              </View>
              
              <View style={styles.statsContainer}>
                  <Text style={styles.statText}>Found: <Text style={{color: '#FFF'}}>{importSummary.total}</Text></Text>
                  <Text style={styles.statText}>Added: <Text style={{color: '#4CAF50'}}>{importSummary.added}</Text></Text>
                  <Text style={styles.statText}>Already Saved: <Text style={{color: '#AAA'}}>{importSummary.existing}</Text></Text>
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
                style={[styles.modalButton, styles.modalSyncButton, { width: '100%', marginTop: 20 }]} 
                onPress={() => setImportSummary({...importSummary, visible: false})}
              >
                <Text style={styles.modalSyncButtonText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141414', paddingTop: 40 },
  headerContainer: { paddingHorizontal: 20, marginTop: 10, marginBottom: 15 },
  header: { color: '#fff', fontSize: 28, fontFamily: 'GoogleSansFlex-Bold' },
  headerCount: { color: '#888', fontSize: 20, fontFamily: 'GoogleSansFlex-Medium' }, 
  
  tabWrapper: { alignItems: 'center', marginBottom: 10 },
  tabContainer: { flexDirection: 'row', width: TAB_WIDTH, height: 44, borderRadius: 22, position: 'relative', overflow: 'hidden', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 },
  blurContainer: { ...StyleSheet.absoluteFill, borderRadius: 22, overflow: 'hidden' },
  activePill: { position: 'absolute', width: TAB_ITEM_WIDTH, top: 2, bottom: 2, left: 2, backgroundColor: '#E50914', borderRadius: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
  tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  tabText: { color: '#CCC', fontFamily: 'GoogleSansFlex-Medium', fontSize: 13 },
  activeTabText: { color: '#FFF', fontFamily: 'GoogleSansFlex-Bold' },
  
  // Updated Layout for Overlay Fix
  toolbarWrapper: { position: 'relative', zIndex: 100, marginBottom: 10 },
  toolbarContainer: { flexDirection: 'row', paddingHorizontal: 16, alignItems: 'center' },
  toolbarLeft: { flexDirection: 'row', gap: 10 },
  toolbarRight: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  iconButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2A2A2A', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, gap: 6 },
  iconButtonText: { color: '#FFF', fontSize: 12, fontFamily: 'GoogleSansFlex-Medium' },
  
  dropdownMenu: { position: 'absolute', top: 40, backgroundColor: '#1F1F1F', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 5, elevation: 10 },
  dropdownLeft: { left: 16 },
  dropdownRight: { right: 16 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, gap: 10 },
  dropdownText: { color: '#CCC', fontSize: 14, fontFamily: 'GoogleSansFlex-Medium' },
  activeDropdownText: { color: '#E50914', fontFamily: 'GoogleSansFlex-Bold' },

  syncHubContainer: { paddingHorizontal: 16, marginBottom: 15 },
  syncingOverlay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A2A2A', paddingVertical: 10, borderRadius: 10, gap: 10 },
  syncingText: { color: '#FFF', fontSize: 13, fontFamily: 'GoogleSansFlex-Medium' },
  
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  cardWrapper: { width: CARD_WIDTH, marginBottom: 16 },
  cardContainer: { borderRadius: 12, backgroundColor: '#1F1F1F', overflow: 'hidden', height: CARD_WIDTH * 1.5, position: 'relative' },
  cardImage: { width: '100%', height: '100%', backgroundColor: '#2A2A2A' },
  cardGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%', zIndex: 1 },
  cardContent: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, zIndex: 2 },
  cardTitle: { color: '#E5E5E5', fontSize: 12, fontFamily: 'GoogleSansFlex-Bold', marginBottom: 2, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  cardSubtitle: { color: '#CCC', fontSize: 10, fontFamily: 'GoogleSansFlex-Regular' },
  unsaveButton: { position: 'absolute', top: 6, right: 6, zIndex: 10, borderRadius: 15, overflow: 'hidden' },
  unsaveBlur: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, marginTop: 50 },
  emptyText: { color: '#fff', fontSize: 20, fontFamily: 'GoogleSansFlex-Bold', marginTop: 20, marginBottom: 8 },
  emptySubtext: { color: '#aaa', fontSize: 14, fontFamily: 'GoogleSansFlex-Regular', textAlign: 'center' },
  
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.75)' },
  modalOverlayDismiss: { ...StyleSheet.absoluteFill },
  modalContentContainer: { width: '85%', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  modalContent: { padding: 24, alignItems: 'center', zIndex: 1 },
  modalTitle: { color: '#FFF', fontSize: 18, fontFamily: 'GoogleSansFlex-Bold', marginBottom: 8 },
  modalSubtitle: { color: '#AAA', fontSize: 13, fontFamily: 'GoogleSansFlex-Regular', textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  modalInput: { width: '100%', backgroundColor: '#1E1E1E', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, color: '#FFF', fontSize: 14, fontFamily: 'GoogleSansFlex-Regular', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', marginBottom: 20 },
  modalButtonsRow: { flexDirection: 'row', width: '100%', gap: 12 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalCancelButton: { backgroundColor: '#2A2A2A' },
  modalCancelButtonText: { color: '#AAA', fontSize: 14, fontFamily: 'GoogleSansFlex-Medium' },
  modalSyncButton: { backgroundColor: '#E50914' },
  modalSyncButtonText: { color: '#FFF', fontSize: 14, fontFamily: 'GoogleSansFlex-Medium' },

  resultsHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 15 },
  statsContainer: { width: '100%', backgroundColor: '#1A1A1A', borderRadius: 10, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  statText: { color: '#888', fontSize: 14, fontFamily: 'GoogleSansFlex-Medium', marginBottom: 4 },
  missedContainer: { width: '100%', backgroundColor: 'rgba(229, 9, 20, 0.1)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(229, 9, 20, 0.2)' },
  missedTitle: { color: '#E50914', fontSize: 13, fontFamily: 'GoogleSansFlex-Bold', marginBottom: 8 },
  missedScroll: { maxHeight: 120 },
  missedText: { color: '#CCC', fontSize: 12, fontFamily: 'GoogleSansFlex-Regular', marginBottom: 4 }
});

export default WatchListPage;