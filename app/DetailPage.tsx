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
  Linking,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native'; 
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
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  useAnimatedScrollHandler,
  Extrapolate,
  FadeInDown,
} from 'react-native-reanimated';
import { STREAM_SOURCES, makeStreamUrl } from '../src/utils/sources';

const { width, height } = Dimensions.get('window');

const TOP_BAR_PADDING = (StatusBar.currentHeight || 40) + 10; 
const HEADER_HEIGHT = height * 0.6;
const IMAGE_SIZES = { THUMBNAIL: 'w154', POSTER_DETAIL: 'w780', STILL: 'w300', ORIGINAL: 'original' };

// --- COMPONENTS ---

const InfoChip = ({ label, value, icon }: { label: string, value: string, icon: any }) => (
  <View style={styles.infoChipContainer}>
    <Text style={styles.infoLabel}>{label}</Text>
    <View style={styles.infoValueRow}>
      <Feather name={icon} size={12} color="#E50914" style={{marginRight: 4}} />
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
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

  // ... existing state ...
  // New state to track which source actually works
  const [workingSourceIndex, setWorkingSourceIndex] = useState(0);
  
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [showFullOverview, setShowFullOverview] = useState(false);
  const [genres, setGenres] = useState<{id: number, name: string}[]>([]);
  const [similarMovies, setSimilarMovies] = useState<any[]>([]);
  
  // Progress State
  const [lastWatched, setLastWatched] = useState<any>(null); 

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  
  const [galleryVisible, setGalleryVisible] = useState(false);
  
  // SOURCE CHECK STATE
  const [sourceStatus, setSourceStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
  
  const scrollY = useSharedValue(0);

  // --- PREFETCH SOURCE LOGIC ---
  useEffect(() => {
    // Only start checking when we have the IDs needed
    if (externalIds && (externalIds.imdb_id || movie.id)) {
        prefetchSources();
    }
  }, [externalIds, movie.id]);

  const prefetchSources = async () => {
     setSourceStatus('checking');
     
     const tmdbId = movie.id;
     const imdbId = externalIds?.imdb_id;
     let foundWorking = false;

     // Loop through sources to find the first one that replies "OK"
     for (let i = 0; i < STREAM_SOURCES.length; i++) {
         const source = STREAM_SOURCES[i];
         // Test S1E1 for TV shows, or just the movie ID
         const testUrl = makeStreamUrl(source.url, movie.media_type, tmdbId, imdbId, 1, 1);
         
         try {
             // HEAD request checks if link exists without downloading video
             const controller = new AbortController();
             const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout
             
             const response = await fetch(testUrl, { 
                 method: 'HEAD', 
                 signal: controller.signal,
                 headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
             });
             clearTimeout(timeoutId);

             if (response.status === 200 || response.status === 302) {
                 console.log(`✅ Pre-check passed: ${source.name}`);
                 setWorkingSourceIndex(i); // Save this index!
                 setSourceStatus('available');
                 foundWorking = true;
                 break; // Stop checking, we found a winner
             }
         } catch (e) {
             // connection failed, try next one
         }
     }

     if (!foundWorking) {
         // Fallback logic
         if (movie.media_type === 'movie' && !externalIds.imdb_id) {
             setSourceStatus('unavailable');
         } else {
             setSourceStatus('available');
             setWorkingSourceIndex(0); // Default to first source
         }
     }
  };

  useEffect(() => {
    const fetchAi = async () => {
      if (!movie.title && !movie.name) return;
      
      setLoadingAi(true);
      setTimeout(async () => {
        const aiData = await getGeminiMoviesSimilarTo(
          movie.title || movie.name, 
          movie.media_type,
          movie.id // <--- ADD THIS
        );
        setAiRecommendations(aiData);
        setLoadingAi(false);
      }, 500); 
    };

    fetchAi();
  }, [movie.id]);

  useEffect(() => {
    loadDeepDetails();
  }, [initialMovie.id]);

  // SOURCE CHECKER LOGIC
  useEffect(() => {
    if (externalIds) {
        checkSourceAvailability();
    }
  }, [externalIds]);

  const checkSourceAvailability = () => {
     setSourceStatus('checking');
     setTimeout(() => {
         if (externalIds.imdb_id) {
             setSourceStatus('available');
         } else if (movie.media_type === 'movie' && !externalIds.imdb_id) {
             setSourceStatus('unavailable');
         } else {
            setSourceStatus('available'); 
         }
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
      checkProgress();
    }, [movie.id, selectedSeason])
  );

  const loadDeepDetails = async () => {
    try {
      checkIfInWatchlist();

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
        if (storedProgress) {
            seasonToLoad = storedProgress.lastSeason;
        } else {
            const validSeasons = fullDetails.seasons.filter((s: any) => s.season_number > 0);
            seasonToLoad = validSeasons.length > 0 ? validSeasons[0].season_number : fullDetails.seasons[0].season_number;
        }
        setSelectedSeason(seasonToLoad);
        fetchEpisodes(seasonToLoad);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchEpisodes = async (seasonNumber: number) => {
    setLoadingEpisodes(true);
    try {
      const data = await getSeasonEpisodes(movie.id, seasonNumber);
      setEpisodes(data);
    } catch (e) { console.error(e); } 
    finally { setLoadingEpisodes(false); }
  };

  const handlePlay = (episode?: TMDBEpisode) => {
    // 1. Check if source is valid
    if (sourceStatus === 'unavailable') {
        alert("No streaming source found for this content.");
        return;
    }

    // 2. Calculate the Season and Episode logic
    let targetSeason = 1;
    let targetEpisode = 1;

    if (episode) {
        // Case A: User clicked a specific episode
        targetSeason = episode.season_number;
        targetEpisode = episode.episode_number;
    } else if (lastWatched && movie.media_type === 'tv') {
        // Case B: User clicked "Resume" (load from memory)
        targetSeason = lastWatched.lastSeason;
        targetEpisode = lastWatched.lastEpisode;
    } else if (movie.media_type === 'tv') {
        // Case C: User clicked "Start Series" (default to S1 E1)
        if(episodes.length > 0) {
            targetSeason = episodes[0].season_number;
            targetEpisode = episodes[0].episode_number;
        }
    }

    // 3. Construct the data object (Now targetSeason exists!)
    const mediaData = {
      tmdbId: movie.id,
      imdbId: externalIds.imdb_id, 
      title: movie.title || movie.name,
      mediaType: movie.media_type,
      season: targetSeason,
      episode: targetEpisode,
      poster: movie.poster_path,
      episodeName: episode ? episode.name : `Episode ${targetEpisode}`,
      startIndex: workingSourceIndex // The pre-checked source
    };

    // 4. Navigate
    navigation.navigate('Player', { ...mediaData });
  };

  const checkIfInWatchlist = async () => { try { const stored = await AsyncStorage.getItem('watchlist'); const list = stored ? JSON.parse(stored) : []; setIsInWatchlist(list.some((item: any) => item.id === movie.id)); } catch (e) {} };
  const toggleWatchlist = async () => { try { const stored = await AsyncStorage.getItem('watchlist'); const list = stored ? JSON.parse(stored) : []; const exists = list.some((item: any) => item.id === movie.id); const newList = exists ? list.filter((item: any) => item.id !== movie.id) : [...list, movie]; await AsyncStorage.setItem('watchlist', JSON.stringify(newList)); setIsInWatchlist(!exists); } catch (e) {} };
  const openTelegramSearch = () => { const title = movie.title || movie.name; const date = movie.release_date || movie.first_air_date; const year = date ? date.substring(0, 4) : ''; const message = encodeURIComponent(`${title} ${year}`); const telegramLink = `tg://msg?text=${message}`; Linking.openURL(telegramLink).catch(err => { const webLink = `https://t.me/share/url?text=${message}`; Linking.openURL(webLink); }); };
  
  // RESTORED: Torrent/Download Search Function
  const openTorrentSearch = () => { 
      const query = `${movie.title || movie.name} ${(movie.release_date || movie.first_air_date)?.slice(0, 4) || ''}`; 
      navigation.navigate('Search', { screen: 'SearchMain', params: { prefillQuery: query } }); 
  };
  
  const scrollHandler = useAnimatedScrollHandler((event) => { scrollY.value = event.contentOffset.y; });
  const heroStyle = useAnimatedStyle(() => { const scale = interpolate(scrollY.value, [-100, 0], [1.2, 1], Extrapolate.CLAMP); const opacity = interpolate(scrollY.value, [0, HEADER_HEIGHT * 0.5], [1, 0], Extrapolate.CLAMP); return { transform: [{ scale }], opacity }; });
  const formatCurrency = (value?: number) => { if (!value) return 'N/A'; return value >= 1000000 ? `$${(value / 1000000).toFixed(1)}M` : `$${value.toLocaleString()}`; };

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
      
      {/* HEADER */}
      <View style={styles.fixedHeader}>
         <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.roundBtn, {overflow: 'hidden'}]}>
            <BlurView intensity={30} tint='dark' experimentalBlurMethod="dimezisBlurView" style={{...StyleSheet.absoluteFillObject, borderRadius: 20}} />
            <Ionicons name="arrow-back" size={24} color="#FFF" />
         </TouchableOpacity>
         <View style={{flexDirection: 'row', gap: 10}}>
            <TouchableOpacity onPress={toggleWatchlist} style={[styles.roundBtn, {overflow: 'hidden'}]}>
              <BlurView intensity={30} tint='dark' experimentalBlurMethod="dimezisBlurView" style={{...StyleSheet.absoluteFillObject, borderRadius: 20}} />
              <MaterialIcons name={isInWatchlist ? "bookmark" : "bookmark-outline"} size={24} color={isInWatchlist ? "#E50914" : "#FFF"} />
            </TouchableOpacity>
         </View>
      </View>

      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{paddingBottom: 120}}
      >
        {/* HERO IMAGE */}
        <TouchableOpacity activeOpacity={0.95} onPress={() => setGalleryVisible(true)} style={{ height: HEADER_HEIGHT }}>
            <Animated.Image source={{ uri: getImageUrl(movie.poster_path, IMAGE_SIZES.POSTER_DETAIL) }} style={[StyleSheet.absoluteFill, heroStyle]} resizeMode="cover" />
            <LinearGradient colors={['transparent', 'rgba(20,20,20,0.2)', '#141414']} style={StyleSheet.absoluteFill} />
            
            <View style={styles.heroContent}>
                <Text style={styles.heroTitle}>{movie.title || movie.name}</Text>
                
                {/* META ROW */}
                <View style={styles.metaRow}>
                    <View style={styles.metaChipNoBlur}>
                        <Ionicons name="star" size={12} color="#FFD700" />
                        <Text style={styles.metaText}>{movie.vote_average.toFixed(1)}</Text>
                    </View>
                    <View style={styles.metaChipNoBlur}>
                        <Text style={styles.metaText}>{(movie.release_date || movie.first_air_date)?.split('-')[0] || 'N/A'}</Text>
                    </View>
                    {movie.runtime > 0 && (<View style={styles.metaChipNoBlur}><Text style={styles.metaText}>{Math.floor(movie.runtime/60)}h {movie.runtime%60}m</Text></View>)}
                    {movie.certification && (<View style={styles.metaChipNoBlur}><Text style={styles.metaText}>{movie.certification}</Text></View>)}
                </View>
                
                {movie.tagline && <Text style={styles.tagline}>"{movie.tagline}"</Text>}
                
                {/* ACTION BUTTONS */}
                <View style={styles.actionButtonContainer}>
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

                  <View style={styles.secondaryActions}>
                    <TouchableOpacity onPress={openTelegramSearch} style={[styles.iconBtn,{overflow: 'hidden'}]}>
                        <Ionicons name="paper-plane-outline" size={22} color="#fff" />
                    </TouchableOpacity>
                    {/* RESTORED: Download Button */}
                    <TouchableOpacity onPress={openTorrentSearch} style={[styles.iconBtn,{overflow: 'hidden'}]}>
                        <Feather name="download" size={22} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>

            </View>
        </TouchableOpacity>

        <View style={styles.contentContainer}>
        
            {/* PRODUCTION / FRANCHISE INFO BAR */}
            <View style={styles.studioBar}>
                 {/* Clickable Director */}
                 {movie.director && (
                   <TouchableOpacity 
                      style={styles.studioItem}
                      onPress={() => navigation.push('CastDetails', { personId: movie.director.id })}
                   >
                     <Text style={styles.studioLabel}>Directed By</Text>
                     <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                         {movie.director.profile_path && (
                             <Image 
                               source={{uri: getImageUrl(movie.director.profile_path, IMAGE_SIZES.THUMBNAIL)}} 
                               style={{width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#444'}}
                             />
                         )}
                         <Text style={[styles.studioValue, {color: '#E50914'}]} numberOfLines={1}>
                            {movie.director.name}
                         </Text>
                     </View>
                   </TouchableOpacity>
                 )}
                 
                 {/* Studio */}
                 {movie.production_companies && movie.production_companies.length > 0 && (
                   <View style={styles.studioItem}>
                     <Text style={styles.studioLabel}>Studio</Text>
                     <Text style={styles.studioValue} numberOfLines={1}>{movie.production_companies[0].name}</Text>
                   </View>
                 )}

                 {/* Franchise */}
                 {movie.belongs_to_collection && (
                   <View style={styles.studioItem}>
                     <Text style={styles.studioLabel}>Franchise</Text>
                     <Text style={styles.studioValue} numberOfLines={1}>{movie.belongs_to_collection.name.replace(' Collection', '')}</Text>
                   </View>
                 )}
            </View>

            {/* Info Grid */}
            <View style={styles.infoGrid}>
                <InfoChip label="Status" value={movie.status || 'N/A'} icon="activity" />
                <InfoChip label="Language" value={(movie.original_language || 'en').toUpperCase()} icon="globe" />
                {movie.budget > 0 && <InfoChip label="Budget" value={formatCurrency(movie.budget)} icon="dollar-sign" />}
                {movie.revenue > 0 && <InfoChip label="Revenue" value={formatCurrency(movie.revenue)} icon="trending-up" />}
            </View>

            {/* Overview */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Overview</Text>
                <Text style={styles.overviewText}>
                    {showFullOverview || (movie.overview?.length || 0) <= 150 ? movie.overview : `${movie.overview?.slice(0, 150)}...`}
                </Text>
                {(movie.overview?.length || 0) > 150 && (
                    <TouchableOpacity onPress={() => setShowFullOverview(!showFullOverview)}>
                        <Text style={styles.readMore}>{showFullOverview ? 'Read Less' : 'Read More'}</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Genres */}
            <View style={styles.section}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexDirection: 'row'}}>
                    {genres.map(g => (
                        <TouchableOpacity key={g.id} style={styles.genreTag} onPress={() => navigation.navigate('ViewAll', { title: `${g.name} ${movie.media_type === 'movie' ? 'Movies' : 'Shows'}`, genreId: g.id, type: `genre/${g.id}`, data: [] })}>
                            <Text style={styles.genreText}>{g.name}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Cast */}
            {movie.cast && movie.cast.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Top Cast</Text>
                    <FlatList
                        horizontal
                        data={movie.cast.slice(0, 10)}
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{paddingRight: 16}}
                        renderItem={({ item, index }) => (
                            <Animated.View entering={FadeInDown.delay(index * 50)} style={styles.castCard}>
                                <TouchableOpacity onPress={() => navigation.push('CastDetails', { personId: item.id })}>
                                    <Image source={{ uri: item.profile_path ? getImageUrl(item.profile_path, IMAGE_SIZES.THUMBNAIL) : 'https://via.placeholder.com/150' }} style={styles.castImage} />
                                    <Text style={styles.castName} numberOfLines={1}>{item.name}</Text>
                                    <Text style={styles.castRole} numberOfLines={1}>{item.character}</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        )}
                    />
                </View>
            )}

            {/* SEASONS & EPISODES UI */}
            {movie.media_type === 'tv' && movie.seasons && (
                <View style={styles.section}>
                    <View style={styles.rowBetween}>
                        <Text style={styles.sectionTitle}>Seasons</Text>
                        <Text style={styles.seasonCount}>{movie.number_of_seasons} Seasons</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 10, paddingBottom: 10}}>
                        {movie.seasons.filter((s:any) => s.season_number > 0).map((s: any) => (
                            <TouchableOpacity 
                                key={s.id} 
                                style={[styles.seasonChip, selectedSeason === s.season_number && styles.seasonChipActive]}
                                onPress={() => { setSelectedSeason(s.season_number); fetchEpisodes(s.season_number); }}
                            >
                                <Text style={[styles.seasonText, selectedSeason === s.season_number && styles.seasonTextActive]}>
                                    {s.name}
                                </Text>
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
                                      <Image 
                                          source={{ uri: ep.still_path ? getImageUrl(ep.still_path, IMAGE_SIZES.STILL) : 'https://via.placeholder.com/100' }} 
                                          style={styles.episodeThumb} 
                                      />
                                      <View style={styles.playOverlay}>
                                        <Ionicons name="play" size={20} color="white" />
                                      </View>
                                    </View>
                                    <View style={{flex: 1, justifyContent: 'center'}}>
                                        <Text style={[styles.epTitle, isActive && {color: '#E50914'}]}>
                                            {ep.episode_number}. {ep.name}
                                        </Text>
                                        <Text style={styles.epOverview} numberOfLines={2}>{ep.overview}</Text>
                                        
                                        {/* ADDED: Episode Release Date */}
                                        <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4}}>
                                            <Ionicons name="calendar-outline" size={10} color="#666" />
                                            <Text style={{color: '#888', fontSize: 10}}>
                                                {ep.air_date || 'Unknown Date'}
                                            </Text>
                                        </View>

                                        {isActive && <Text style={{color: '#E50914', fontSize: 10, marginTop: 4}}>RESUME HERE</Text>}
                                    </View>
                                </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                </View>
            )}

            {/* AI RECOMMENDATIONS SECTION */}
            {(loadingAi || aiRecommendations.length > 0) && (
              <View style={styles.section}>
                  <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 6}}>
                    <Ionicons name="sparkles" size={18} color="#FFD700" />
                    <Text style={[styles.sectionTitle, { marginBottom: 0, color: '#FFD700' }]}>
                       Vibe Match (AI)
                    </Text>
                  </View>
                  
                  {loadingAi ? (
                    <View style={{height: 180, justifyContent: 'center', alignItems: 'center'}}>
                      <ActivityIndicator size="small" color="#FFD700" />
                      <Text style={{color: '#666', fontSize: 10, marginTop: 8}}>Analyzing Vibe...</Text>
                    </View>
                  ) : (
                    <FlatList
                        horizontal
                        data={aiRecommendations}
                        showsHorizontalScrollIndicator={false}
                        renderItem={({ item, index }) => (
                            <Animated.View entering={FadeInDown.delay(index * 100)}>
                              <TouchableOpacity 
                                style={styles.similarCard} 
                                onPress={() => navigation.push('Detail', { movie: item })}
                              >
                                  <Image 
                                    source={{ uri: getImageUrl(item.poster_path, IMAGE_SIZES.THUMBNAIL) }} 
                                    style={[styles.similarImage, { borderColor: 'rgba(255, 215, 0, 0.3)', borderWidth: 1 }]} 
                                  />
                                  <View style={styles.ratingBadge}>
                                      <Ionicons name="star" size={10} color="#FFD700" />
                                      <Text style={styles.ratingText}>{item.vote_average.toFixed(1)}</Text>
                                  </View>
                                  <Text style={styles.similarTitle} numberOfLines={1}>
                                    {item.title || item.name}
                                  </Text>
                              </TouchableOpacity>
                            </Animated.View>
                        )}
                    />
                  )}
              </View>
            )}

            {/* Standard Similar Movies */}
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
                                <View style={styles.ratingBadge}>
                                    <Ionicons name="star" size={10} color="#FFD700" />
                                    <Text style={styles.ratingText}>{item.vote_average.toFixed(1)}</Text>
                                </View>
                                <Text style={styles.similarTitle} numberOfLines={1}>{item.title || item.name}</Text>
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
  panel: '#1F1F1F',
  card: '#222',
  accent: '#E50914',
  white: '#FFFFFF',
  muted: '#888',
  lightText: '#ccc',
  subtleBorder: '#333',
  overlay: 'rgba(255,255,255,0.05)',
};

const SPACING = { xs: 6, sm: 8, md: 12, lg: 16, xl: 24 };

const FONTS = {
  regular: 'GoogleSansFlex-Regular',
  medium: 'GoogleSansFlex-Medium',
  bold: 'GoogleSansFlex-Bold',
};

const styles = StyleSheet.create({
  baseContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  fixedHeader: {
    position: 'absolute',
    top: TOP_BAR_PADDING,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    zIndex: 100,
  },
  roundBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroContent: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
  },
  heroTitle: {
    fontFamily: FONTS.bold,
    fontSize: 32,
    color: COLORS.white,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    marginBottom: 8,
  },
  tagline: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.lightText,
    fontStyle: 'italic',
    marginTop: 8,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metaChipNoBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(20, 20, 20, 0.7)', 
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  metaText: {
    color: COLORS.white,
    fontSize: 12,
    fontFamily: FONTS.bold,
  },
  actionButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 12,
  },
  watchNowBtn: {
    flex: 1,
    backgroundColor: COLORS.white,
    height: 48,
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
  secondaryActions: {
    flexDirection: 'row',
    gap: 12,
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    padding: SPACING.lg,
  },
  
  studioBar: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    marginBottom: 20,
    gap: 20,
  },
  studioItem: {
    flex: 1,
  },
  studioLabel: {
    color: '#666',
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: 2,
    fontWeight: 'bold'
  },
  studioValue: {
    color: '#ddd',
    fontSize: 13,
    fontWeight: '600'
  },

  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: COLORS.panel,
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.subtleBorder,
  },
  infoChipContainer: {
    width: '50%',
    marginBottom: 12,
  },
  infoLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontFamily: FONTS.regular,
    marginBottom: 2,
  },
  infoValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoValue: {
    color: COLORS.white,
    fontSize: 13,
    fontFamily: FONTS.medium,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    color: COLORS.white,
    fontFamily: FONTS.bold,
    marginBottom: 12,
  },
  overviewText: {
    color: COLORS.lightText,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FONTS.regular,
  },
  readMore: {
    color: COLORS.accent,
    fontWeight: 'bold',
    marginTop: 4,
  },
  genreTag: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  genreText: {
    color: COLORS.white,
    fontSize: 13,
    fontFamily: FONTS.medium,
  },
  castCard: {
    width: 100,
    marginRight: 12,
  },
  castImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.subtleBorder,
  },
  castName: {
    color: COLORS.white,
    fontSize: 12,
    textAlign: 'center',
    fontFamily: FONTS.medium,
  },
  castRole: {
    color: COLORS.muted,
    fontSize: 10,
    textAlign: 'center',
  },
  similarCard: {
    width: 120,
    marginRight: 12,
  },
  similarImage: {
    width: 120,
    height: 180,
    borderRadius: 8,
    backgroundColor: COLORS.card,
    marginBottom: 6,
  },
  ratingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: 'bold',
  },
  similarTitle: {
    color: COLORS.lightText,
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seasonCount: {
    color: '#666',
    fontSize: 12,
  },
  seasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.card,
  },
  seasonChipActive: {
    backgroundColor: COLORS.accent,
  },
  seasonText: {
    color: COLORS.muted,
    fontSize: 13,
  },
  seasonTextActive: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
  episodeRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: COLORS.overlay,
    padding: 8,
    borderRadius: 8,
  },
  episodeRowActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
    borderColor: COLORS.accent,
    borderWidth: 1,
  },
  episodeThumb: {
    width: 100,
    height: 56,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 4,
  },
  epTitle: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  epOverview: {
    color: COLORS.muted,
    fontSize: 11,
  },
});

export default DetailPage;