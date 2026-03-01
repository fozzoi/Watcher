import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Dimensions,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Image,
  ActivityIndicator,
  StatusBar,
  InteractionManager,
  Platform,
  ToastAndroid,
  Alert,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native'; 
import * as Clipboard from 'expo-clipboard'; 
import { 
  getImageUrl, 
  getMovieGenres, 
  getSimilarMedia, 
  getSeasonEpisodes, 
  getMovieImages, 
  TMDBEpisode, 
  TMDBImage, 
  getMediaDetails,
  getExternalIds,
  getGeminiMoviesSimilarTo,
} from '../src/tmdb';
import { getProgress } from '../src/utils/progress'; 
import { useRoute, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  useAnimatedScrollHandler,
  FadeInDown,
  Extrapolate,
} from 'react-native-reanimated';
import { STREAM_SOURCES, makeStreamUrl } from '../src/utils/sources';

const { width, height } = Dimensions.get('window');

const TOP_BAR_PADDING = (StatusBar.currentHeight || 40) + 10; 
const HEADER_HEIGHT = height * 0.55; 
const IMAGE_SIZES = { THUMBNAIL: 'w154', POSTER_DETAIL: 'w780', STILL: 'w300', ORIGINAL: 'original' };

// --- GOOGLE-STYLE CHIP COMPONENTS ---
const GoogleMetaChip = ({ icon, text, color = "#FFF" }: { icon?: any, text: string | number, color?: string }) => (
  <View style={styles.googleMetaChip}>
    {icon && <Ionicons name={icon} size={12} color={color} style={{ marginRight: 4 }} />}
    <Text style={[styles.googleMetaText, { color }]}>{text}</Text>
  </View>
);

const DetailPage = () => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const { movie: initialMovie } = route.params as { movie: any };

  const [movie, setMovie] = useState(initialMovie);
  const [movieImages, setMovieImages] = useState<TMDBImage[]>([]);
  const [externalIds, setExternalIds] = useState<any>({}); 

  const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);

  const [workingSourceIndex, setWorkingSourceIndex] = useState(0);
  
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [isWatched, setIsWatched] = useState(false); 
  
  const [showFullOverview, setShowFullOverview] = useState(false);
  const [genres, setGenres] = useState<{id: number, name: string}[]>([]);
  const [similarMovies, setSimilarMovies] = useState<any[]>([]);
  
  const [lastWatched, setLastWatched] = useState<any>(null); 
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [sourceStatus, setSourceStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
  
  const scrollY = useSharedValue(0);

  useEffect(() => {
    if (externalIds && (externalIds.imdb_id || movie.id)) {
        prefetchSources();
    }
  }, [externalIds, movie.id]);

  const prefetchSources = async () => {
     setSourceStatus('checking');
     const tmdbId = movie.id;
     const imdbId = externalIds?.imdb_id;
     let foundWorking = false;

     for (let i = 0; i < STREAM_SOURCES.length; i++) {
         const source = STREAM_SOURCES[i];
         const testUrl = makeStreamUrl(source.url, movie.media_type, tmdbId, imdbId, 1, 1);
         try {
             const controller = new AbortController();
             const timeoutId = setTimeout(() => controller.abort(), 3000); 
             const response = await fetch(testUrl, { method: 'HEAD', signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
             clearTimeout(timeoutId);

             if (response.status === 200 || response.status === 302) {
                 setWorkingSourceIndex(i); 
                 setSourceStatus('available');
                 foundWorking = true;
                 break; 
             }
         } catch (e) {}
     }
     if (!foundWorking) {
         if (movie.media_type === 'movie' && !externalIds.imdb_id) setSourceStatus('unavailable');
         else { setSourceStatus('available'); setWorkingSourceIndex(0); }
     }
  };

  useEffect(() => {
    const fetchAi = async () => {
      if (!movie.title && !movie.name) return;
      setLoadingAi(true);
      const aiData = await getGeminiMoviesSimilarTo(movie.title || movie.name, movie.media_type, movie.id);
      setAiRecommendations(aiData);
      setLoadingAi(false);
    };
    const task = InteractionManager.runAfterInteractions(() => fetchAi());
    return () => task.cancel(); 
  }, [movie.id]);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => loadDeepDetails());
    return () => task.cancel(); 
  }, [initialMovie.id]);

  useEffect(() => {
    if (externalIds) checkSourceAvailability();
  }, [externalIds]);

  const checkSourceAvailability = () => {
     setSourceStatus('checking');
     setTimeout(() => {
         if (externalIds.imdb_id) setSourceStatus('available');
         else if (movie.media_type === 'movie' && !externalIds.imdb_id) setSourceStatus('unavailable');
         else setSourceStatus('available'); 
     }, 800); 
  };

  useFocusEffect(
    useCallback(() => {
      const checkProgress = async () => {
        const progress = await getProgress(movie.id);
        setLastWatched(progress);
        if (progress && movie.media_type === 'tv' && progress.lastSeason !== selectedSeason) {
            setSelectedSeason(progress.lastSeason);
            fetchEpisodes(progress.lastSeason);
        }
      };
      const task = InteractionManager.runAfterInteractions(() => checkProgress());
      return () => task.cancel();
    }, [movie.id, selectedSeason])
  );

  const loadDeepDetails = async () => {
    try {
      checkIfInWatchlist();
      checkIfWatched(); 

      const [fullDetails, imagesData, genresData, similarData, idsData] = await Promise.all([
        getMediaDetails(initialMovie.id, initialMovie.media_type), 
        getMovieImages(initialMovie.id, initialMovie.media_type),
        getMovieGenres(initialMovie.id, initialMovie.media_type),
        getSimilarMedia(initialMovie.id, initialMovie.media_type),
        getExternalIds(initialMovie.id, initialMovie.media_type)
      ]);

      setMovie(fullDetails); 
      setMovieImages(imagesData);
      setGenres(genresData);
      setSimilarMovies(similarData);
      setExternalIds(idsData);

      if (initialMovie.media_type === 'tv' && fullDetails.seasons?.length > 0) {
        const storedProgress = await getProgress(initialMovie.id);
        let seasonToLoad = 1;
        if (storedProgress) seasonToLoad = storedProgress.lastSeason;
        else {
            const validSeasons = fullDetails.seasons.filter((s: any) => s.season_number > 0);
            seasonToLoad = validSeasons.length > 0 ? validSeasons[0].season_number : fullDetails.seasons[0].season_number;
        }
        setSelectedSeason(seasonToLoad);
        fetchEpisodes(seasonToLoad);
      }
    } catch (e) {}
  };

  const fetchEpisodes = async (seasonNumber: number) => {
    setLoadingEpisodes(true);
    try {
      const data = await getSeasonEpisodes(movie.id, seasonNumber);
      setEpisodes(data);
    } catch (e) {} finally { setLoadingEpisodes(false); }
  };

  const handlePlay = (episode?: TMDBEpisode) => {
    if (sourceStatus === 'unavailable') {
        alert("No streaming source found for this content.");
        return;
    }

    let targetSeason = 1;
    let targetEpisode = 1;

    if (episode) {
        targetSeason = episode.season_number;
        targetEpisode = episode.episode_number;
    } else if (lastWatched && movie.media_type === 'tv') {
        targetSeason = lastWatched.lastSeason;
        targetEpisode = lastWatched.lastEpisode;
    } else if (movie.media_type === 'tv') {
        if(episodes.length > 0) {
            targetSeason = episodes[0].season_number;
            targetEpisode = episodes[0].episode_number;
        }
    }

    const mediaData = {
      tmdbId: movie.id,
      imdbId: externalIds.imdb_id, 
      title: movie.title || movie.name,
      mediaType: movie.media_type,
      season: targetSeason,
      episode: targetEpisode,
      poster: movie.poster_path,
      episodeName: episode ? episode.name : `Episode ${targetEpisode}`,
      startIndex: workingSourceIndex 
    };

    navigation.navigate('Player', { ...mediaData });
  };

  const checkIfInWatchlist = async () => { try { const stored = await AsyncStorage.getItem('watchlist'); const list = stored ? JSON.parse(stored) : []; setIsInWatchlist(list.some((item: any) => item.id === movie.id)); } catch (e) {} };
  const toggleWatchlist = async () => { try { const stored = await AsyncStorage.getItem('watchlist'); const list = stored ? JSON.parse(stored) : []; const exists = list.some((item: any) => item.id === movie.id); const newList = exists ? list.filter((item: any) => item.id !== movie.id) : [...list, movie]; await AsyncStorage.setItem('watchlist', JSON.stringify(newList)); setIsInWatchlist(!exists); } catch (e) {} };

  const checkIfWatched = async () => { try { const stored = await AsyncStorage.getItem('history'); const list = stored ? JSON.parse(stored) : []; setIsWatched(list.some((item: any) => item.id === movie.id)); } catch (e) {} };
  const toggleWatched = async () => { try { const stored = await AsyncStorage.getItem('history'); const list = stored ? JSON.parse(stored) : []; const exists = list.some((item: any) => item.id === movie.id); const newList = exists ? list.filter((item: any) => item.id !== movie.id) : [...list, movie]; await AsyncStorage.setItem('history', JSON.stringify(newList)); setIsWatched(!exists); } catch (e) {} };

  const openTelegramSearch = () => { const title = movie.title || movie.name; const date = movie.release_date || movie.first_air_date; const year = date ? date.substring(0, 4) : ''; const message = encodeURIComponent(`${title} ${year}`); const telegramLink = `tg://msg?text=${message}`; Linking.openURL(telegramLink).catch(err => { const webLink = `https://t.me/share/url?text=${message}`; Linking.openURL(webLink); }); };
  const openTorrentSearch = () => { const query = `${movie.title || movie.name} ${(movie.release_date || movie.first_air_date)?.slice(0, 4) || ''}`; navigation.navigate('Search', { screen: 'SearchMain', params: { prefillQuery: query } }); };
  
  const copyTitleToClipboard = async () => {
    const textToCopy = `${movie.title || movie.name} ${(movie.release_date || movie.first_air_date)?.substring(0, 4) || ''}`;
    await Clipboard.setStringAsync(textToCopy);
    if (Platform.OS === 'android') {
      ToastAndroid.show('Copied to clipboard!', ToastAndroid.SHORT);
    } else {
      Alert.alert('Copied', 'Title and year copied to clipboard!');
    }
  };

  const scrollHandler = useAnimatedScrollHandler((event) => { scrollY.value = event.contentOffset.y; });
  const heroStyle = useAnimatedStyle(() => { const scale = interpolate(scrollY.value, [-100, 0], [1.2, 1], Extrapolate.CLAMP); const opacity = interpolate(scrollY.value, [0, HEADER_HEIGHT * 0.5], [1, 0], Extrapolate.CLAMP); return { transform: [{ scale }], opacity }; });

  const displayTitle = movie.title || movie.name;
  const releaseYear = (movie.release_date || movie.first_air_date)?.split('-')[0] || '';

  const getButtonText = () => {
    if (sourceStatus === 'checking') return "Finding Best Stream..."; // Updated text
    if (sourceStatus === 'unavailable') return "Source Unavailable";

    if (movie.media_type === 'movie') {
        if (lastWatched) return "Resume Movie";
        return "Watch Movie";
    }
    if (lastWatched) {
        return `Resume S${lastWatched.lastSeason}:E${lastWatched.lastEpisode}`;
    }
    return "Start Series";
  };
  
  return (
    <View style={styles.baseContainer}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      
      {/* HEADER: BACK (Left) & LOVE (Right) */}
      <View style={styles.fixedHeader}>
         <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtnWrapper}>
            <BlurView intensity={30} tint="dark" style={styles.iconBlur}>
                <Ionicons name="arrow-back" size={24} color="#FFF" />
            </BlurView>
         </TouchableOpacity>

         
      </View>

      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        // ✅ INCREASED PADDING SO TAB BAR DOESN'T COVER THE BOTTOM
        contentContainerStyle={{paddingBottom: 140}} 
      >
        {/* HERO IMAGE & BOTTOM CENTER PLAY BUTTON */}
        <View style={{ height: HEADER_HEIGHT }}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={0.95} onPress={() => setGalleryVisible(true)}>
                <Animated.Image source={{ uri: getImageUrl(movie.poster_path, IMAGE_SIZES.POSTER_DETAIL) }} style={[StyleSheet.absoluteFill, heroStyle]} resizeMode="cover" />
                <LinearGradient colors={['transparent', 'rgba(20,20,20,0.6)', '#141414']} style={StyleSheet.absoluteFill} locations={[0, 0.6, 1]} />
            </TouchableOpacity>

            {/* ✅ MOVED TO BOTTOM MIDDLE OF POSTER */}
            <View style={styles.bottomPlayOverlay} pointerEvents="box-none">
               <TouchableOpacity 
                    style={[styles.watchNowBtn, sourceStatus === 'unavailable' && styles.watchNowBtnDisabled]} 
                    onPress={() => handlePlay()} 
                    activeOpacity={0.8}
                    disabled={sourceStatus === 'unavailable' || sourceStatus === 'checking'}
                  >
                    {sourceStatus === 'checking' ? (
                       <ActivityIndicator color="#000" size="small" />
                    ) : (
                       <Ionicons name={lastWatched ? "play-skip-forward" : "play"} size={24} color="#000" />
                    )}
                    <Text style={styles.watchNowText}>{getButtonText()}</Text>
                  </TouchableOpacity>
            </View>
        </View>

        <View style={styles.contentContainer}>
            
            

            {/* GOOGLE SEARCH ACTION ROW */}
            
            
            {/* TITLE & COPY ROW */}
            <View style={styles.titleRow}>
                <Text style={styles.movieTitle} numberOfLines={3}>{displayTitle}</Text>
                <TouchableOpacity style={styles.copyBtn} onPress={copyTitleToClipboard}>
                    <Feather name="copy" size={20} color="#A3A3A3" />
                </TouchableOpacity>
            </View>

            {/* GENRES */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 10}}>
                {genres.map(g => (
                    <TouchableOpacity key={g.id} onPress={() => navigation.navigate('ViewAll', { title: `${g.name}`, genreId: g.id, type: `genre/${g.id}`, data: [] })}>
                        <Text style={styles.genreText}>{g.name}  •  </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* GOOGLE SEARCH META CHIPS */}
            <View style={styles.metaRow}>
                {releaseYear ? <GoogleMetaChip text={releaseYear} /> : null}
                <GoogleMetaChip icon="star" color="#FFD700" text={movie.vote_average?.toFixed(1) || '0.0'} />
                {movie.runtime > 0 && <GoogleMetaChip text={`${Math.floor(movie.runtime/60)}h ${movie.runtime%60}m`} />}
                {movie.certification && <GoogleMetaChip text={movie.certification} />}
                {(movie.media_type === 'tv' && movie.number_of_seasons) ? <GoogleMetaChip text={`${movie.number_of_seasons} Seasons`} /> : null}
                
            </View>

            {/* OVERVIEW */}
            <View style={styles.section}>
                <Text style={styles.overviewText}>
                    {showFullOverview || (movie.overview?.length || 0) <= 160 ? movie.overview : `${movie.overview?.slice(0, 160)}...`}
                </Text>
                {(movie.overview?.length || 0) > 160 && (
                    <TouchableOpacity onPress={() => setShowFullOverview(!showFullOverview)}>
                        <Text style={styles.readMore}>{showFullOverview ? 'Less' : 'More'}</Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.actionRow}>
                <TouchableOpacity 
                    style={[styles.googleActionBtn, isWatched && styles.googleActionBtnActive]} 
                    onPress={toggleWatched}
                >
                    <Ionicons name={isWatched ? "checkmark-circle" : "checkmark-circle-outline"} size={18} color={isWatched ? "#4CAF50" : "#A3A3A3"} />
                    <Text style={[styles.googleActionText, isWatched && {color: '#4CAF50'}]}>
                        {isWatched ? "Watched" : "Watched"}
                    </Text>
                </TouchableOpacity>

        
                  <TouchableOpacity onPress={toggleWatchlist} style={styles.googleActionBtn}>
                    <Ionicons name={isInWatchlist ? "heart" : "heart-outline"} size={18} color={isInWatchlist ? "#E50914" : "#A3A3A3"} />
                    <Text style={styles.googleActionText}>Watchlist</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.googleActionBtn} onPress={openTorrentSearch}>
                    <Feather name="download" size={18} color="#A3A3A3" />
                    <Text style={styles.googleActionText}>Torrent</Text>
                </TouchableOpacity>
            </View>

            

            {/* CAST */}
            {movie.cast && movie.cast.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Cast</Text>
                    <FlatList
                        horizontal
                        data={movie.cast.slice(0, 10)}
                        showsHorizontalScrollIndicator={false}
                        renderItem={({ item, index }) => (
                            <Animated.View entering={FadeInDown.delay(index * 50)} style={styles.castCard}>
                                <TouchableOpacity onPress={() => navigation.push('CastDetails', { personId: item.id })}>
                                    <Image source={{ uri: item.profile_path ? getImageUrl(item.profile_path, IMAGE_SIZES.THUMBNAIL) : 'https://via.placeholder.com/150' }} style={styles.castImage} />
                                    <Text style={styles.castName} numberOfLines={1}>{item.name}</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        )}
                    />
                </View>
            )}

            {/* EPISODES UI */}
            {movie.media_type === 'tv' && movie.seasons && (
                <View style={styles.section}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 10, paddingBottom: 16}}>
                        {movie.seasons.filter((s:any) => s.season_number > 0).map((s: any) => (
                            <TouchableOpacity 
                                key={s.id} 
                                style={[styles.seasonChip, selectedSeason === s.season_number && styles.seasonChipActive]}
                                onPress={() => { setSelectedSeason(s.season_number); fetchEpisodes(s.season_number); }}
                            >
                                <Text style={[styles.seasonText, selectedSeason === s.season_number && styles.seasonTextActive]}>{s.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    
                    {loadingEpisodes ? <ActivityIndicator color="#E50914" /> : (
                        <View style={{gap: 10}}>
                            {episodes.map(ep => {
                                const isActive = lastWatched && lastWatched.lastSeason === ep.season_number && lastWatched.lastEpisode === ep.episode_number;

                                return (
                                <TouchableOpacity 
                                  key={ep.id} 
                                  style={[styles.episodeRow, isActive && styles.episodeRowActive]}
                                  onPress={() => handlePlay(ep)}
                                >
                                    <View>
                                      <Image source={{ uri: ep.still_path ? getImageUrl(ep.still_path, IMAGE_SIZES.STILL) : 'https://via.placeholder.com/100' }} style={styles.episodeThumb} />
                                      <View style={styles.playOverlay}>
                                        <Ionicons name="play" size={20} color="white" />
                                      </View>
                                    </View>
                                    <View style={{flex: 1, justifyContent: 'center'}}>
                                        <Text style={[styles.epTitle, isActive && {color: '#FFF'}]} numberOfLines={1}>{ep.episode_number}. {ep.name}</Text>
                                        <Text style={styles.epOverview} numberOfLines={2}>{ep.overview}</Text>
                                    </View>
                                </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                </View>
            )}

            {/* AI RECOMMENDATIONS */}
            {(loadingAi || aiRecommendations.length > 0) && (
              <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: '#FFD700' }]}>Vibe Match AI</Text>
                  {loadingAi ? (
                    <ActivityIndicator size="small" color="#FFD700" style={{marginTop: 20}} />
                  ) : (
                    <FlatList
                        horizontal
                        data={aiRecommendations}
                        showsHorizontalScrollIndicator={false}
                        renderItem={({ item, index }) => (
                            <Animated.View entering={FadeInDown.delay(index * 100)}>
                              <TouchableOpacity style={styles.similarCard} onPress={() => navigation.push('Detail', { movie: item })}>
                                  <Image source={{ uri: getImageUrl(item.poster_path, IMAGE_SIZES.THUMBNAIL) }} style={styles.similarImage} />
                              </TouchableOpacity>
                            </Animated.View>
                        )}
                    />
                  )}
              </View>
            )}

            {/* SIMILAR */}
            {similarMovies.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>More Like This</Text>
                    <FlatList
                        horizontal
                        data={similarMovies}
                        showsHorizontalScrollIndicator={false}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.similarCard} onPress={() => navigation.push('Detail', { movie: item })}>
                                <Image source={{ uri: getImageUrl(item.poster_path, IMAGE_SIZES.THUMBNAIL) }} style={styles.similarImage} />
                            </TouchableOpacity>
                        )}
                    />
                </View>
            )}
        </View>
      </Animated.ScrollView>
    </View>
  );
};

const COLORS = {
  background: '#141414',
  white: '#FFFFFF',
  muted: '#A3A3A3',
};

const FONTS = { regular: 'GoogleSansFlex-Regular', medium: 'GoogleSansFlex-Medium', bold: 'GoogleSansFlex-Bold' };

const styles = StyleSheet.create({
  baseContainer: { flex: 1, backgroundColor: COLORS.background },
  
  // Header (Back & Love)
  fixedHeader: { position: 'absolute', top: TOP_BAR_PADDING, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', zIndex: 100 },
  iconBtnWrapper: { borderRadius: 24, overflow: 'hidden' },
  iconBlur: { padding: 10, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.3)' },
  
  // ✅ Bottom Center Play Button (NEW)
    bottomPlayOverlay: { 
      position: 'absolute', 
      bottom: 20, // Hovering perfectly over the title area
      justifyContent: 'center', 
      alignItems: 'center',
      alignContent: 'center',
      alignSelf: 'center',
  
  },
  watchNowBtn: {
    flex: 1,
    backgroundColor: COLORS.white,
    height: 55,
    width: 200,
    overflow: 'hidden',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  watchNowBtnDisabled: {
    backgroundColor: '#555',
    opacity: 0.7,
  },
  watchNowText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  }, 
  resumeText: { 
    color: COLORS.white, fontFamily: FONTS.bold, marginTop: 12, textShadowColor: 'rgba(0,0,0,0.8)', 
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,alignSelf: 'center' },

  // Content Layout
  contentContainer: { paddingHorizontal: 16, marginTop: -10 },
  
  // Title & Copy Row
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  movieTitle: { flex: 1, fontFamily: FONTS.bold, fontSize: 32, color: COLORS.white, lineHeight: 38, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  copyBtn: { padding: 8, marginTop: 4 },
  
  // Google Meta Chips
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  googleMetaChip: { flexDirection: 'row', alignItems: 'center', paddingRight: 10,backgroundColor: 'rgba(255, 255, 255, 0.12)', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10 },
  googleMetaText: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.muted },

  // Google Action Row
  actionRow: { gap: 10, flexDirection: 'row', marginBottom: 20 ,justifyContent: 'space-around'},
  googleActionBtn: {  flexDirection: 'row',justifyContent: 'center', alignItems: 'center', backgroundColor: '#2A2A2A', width:120,paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#444' },
  googleActionBtnActive: { borderColor: '#4CAF50', backgroundColor: 'rgba(76, 175, 80, 0.1)' },
  googleActionText: { color: COLORS.white, fontFamily: FONTS.medium, fontSize: 14, marginLeft: 6 },

  // Content Text
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 18, color: COLORS.white, fontFamily: FONTS.bold, marginBottom: 12 },
  overviewText: { color: COLORS.white, fontSize: 15, lineHeight: 24, fontFamily: FONTS.regular },
  readMore: { color: '#E50914', fontFamily: FONTS.bold, marginTop: 4, fontSize: 15 },
  
  genreText: { color: COLORS.muted, fontSize: 13, fontFamily: FONTS.medium },

  // Cards & Cast
  castCard: { width: 100, marginRight: 16 },
  castImage: { width: 100, height: 150, borderRadius: 30, marginBottom: 8, backgroundColor: '#2A2A2A' },
  castName: { color: COLORS.white, fontSize: 12, textAlign: 'center', fontFamily: FONTS.medium },
  
  similarCard: { width: 110, marginRight: 12 },
  similarImage: { width: 110, height: 160, borderRadius: 8, backgroundColor: '#2A2A2A' },

  // TV Shows
  seasonChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#2A2A2A', borderWidth: 1, borderColor: 'transparent' },
  seasonChipActive: { borderColor: COLORS.white },
  seasonText: { color: COLORS.muted, fontSize: 13, fontFamily: FONTS.medium },
  seasonTextActive: { color: COLORS.white, fontFamily: FONTS.bold },
  
  episodeRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 16 },
  episodeRowActive: { opacity: 1 },
  episodeThumb: { width: 130, height: 75, borderRadius: 8, backgroundColor: '#2A2A2A' },
  playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8 },
  epTitle: { color: COLORS.white, fontSize: 14, fontFamily: FONTS.bold, marginBottom: 4 },
  epOverview: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
});

export default DetailPage;