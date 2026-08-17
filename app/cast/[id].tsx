// CastDetails.tsx
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Share,
  Modal,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  ToastAndroid,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolate,
  useAnimatedScrollHandler,
  FadeInDown,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';

import {
  getPersonDetails,
  getPersonCombinedCredits,
  getPersonImages,
  getImageUrl,
  TMDBPerson,
  TMDBResult,
  TMDBImage,
  getFullDetails,
} from '../../src/tmdb';
import { CastDetailSkeleton } from '../../src/components/cast/CastDetailSkeleton';

const TOP_BAR_PADDING = (StatusBar.currentHeight || 44) + 8;

// Shared design system — kept in sync with DetailPage.tsx
const C = {
  bg: '#0A0A0B',
  surface: '#141416',
  surface2: '#1C1C20',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.12)',
  white: '#FAFAFA',
  text: '#E8E8EA',
  muted: '#7A7A82',
  mutedSoft: '#9B9BA3',
  red: '#FF453A',
  gold: '#FFD60A',
  green: '#30D158',
};

export default function CastDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const personId = Number(id);
  const { width, height } = useWindowDimensions();

  const HEADER_HEIGHT = height * 0.5;
  const COLLAPSED_HEADER_HEIGHT = TOP_BAR_PADDING + 46;
  const CARD_GAP = 12;
  const CARD_WIDTH = (width - 40 - CARD_GAP * 2) / 3;

  const [person, setPerson] = useState<TMDBPerson | null>(null);
  const [credits, setCredits] = useState<TMDBResult[]>([]);
  const [personImages, setPersonImages] = useState<TMDBImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBioExpanded, setIsBioExpanded] = useState(false);

  const [isLiked, setIsLiked] = useState(false);
  const likedScale = useSharedValue(1);

  const [galleryVisible, setGalleryVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const headerListRef = useRef<FlatList>(null);
  const mainGalleryRef = useRef<FlatList>(null);
  const thumbnailGalleryRef = useRef<FlatList>(null);

  const scrollY = useSharedValue(0);

  useEffect(() => {
    loadData();
    checkIfLiked();
  }, [personId]);

  const checkIfLiked = async () => {
    try {
      const stored = await AsyncStorage.getItem('favoriteArtists');
      if (stored) {
        const artists = JSON.parse(stored);
        setIsLiked(artists.some((a: any) => a.id === personId));
      }
    } catch {}
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [personData, creditsData, imagesData] = await Promise.all([
        getPersonDetails(personId),
        getPersonCombinedCredits(personId),
        getPersonImages(personId),
      ]);

      setPerson(personData);
      setPersonImages(imagesData);

      const uniqueCredits = creditsData
        .filter((v, i, a) => a.findIndex((t) => t.id === v.id) === i)
        .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));

      setCredits(uniqueCredits);
    } catch (error) {
      console.error('Error loading person details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLovePress = useCallback(async () => {
    if (!person) return;
    const newValue = !isLiked;
    setIsLiked(newValue);

    likedScale.value = withSequence(
      withSpring(1.2, { damping: 10, stiffness: 200 }),
      withSpring(1, { damping: 10, stiffness: 200 }),
    );

    try {
      const stored = await AsyncStorage.getItem('favoriteArtists');
      let artists = stored ? JSON.parse(stored) : [];

      if (newValue) {
        const artistToSave = {
          id: person.id,
          name: person.name,
          profile_path: person.profile_path,
          known_for_department: person.known_for_department,
          popularity: person.popularity,
        };
        if (!artists.some((a: any) => a.id === person.id)) artists.push(artistToSave);
      } else {
        artists = artists.filter((a: any) => a.id !== person.id);
      }

      await AsyncStorage.setItem('favoriteArtists', JSON.stringify(artists));
    } catch {
      setIsLiked(!newValue);
    }
  }, [isLiked, person, likedScale]);

  const animatedHeartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likedScale.value }],
  }));

  const handleGalleryShare = async () => {
    const currentImgPath = personImages[currentImageIndex]?.file_path || person?.profile_path;
    if (!currentImgPath) return;
    const imageUrl = getImageUrl(currentImgPath, 'original');
    try {
      await Share.share({
        message: `Check out ${person?.name}! Shared from Watcher app. ${imageUrl}`,
        url: imageUrl,
      });
    } catch {}
  };

  const copyName = async () => {
    if (!person) return;
    await Clipboard.setStringAsync(person.name);
    if (Platform.OS === 'android') ToastAndroid.show('Copied!', ToastAndroid.SHORT);
    else Alert.alert('Copied', person.name);
  };

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const headerStyle = useAnimatedStyle(() => {
    const heightAnim = interpolate(
      scrollY.value,
      [0, HEADER_HEIGHT - COLLAPSED_HEADER_HEIGHT],
      [HEADER_HEIGHT, COLLAPSED_HEADER_HEIGHT],
      Extrapolate.CLAMP,
    );
    return { height: heightAnim };
  });

  const imageContainerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, HEADER_HEIGHT - COLLAPSED_HEADER_HEIGHT - 50],
      [1, 0.15],
      Extrapolate.CLAMP,
    );
    const scale = interpolate(scrollY.value, [-100, 0], [1.2, 1], Extrapolate.CLAMP);
    return { opacity, transform: [{ scale }] };
  });

  const CreditCard = ({ item, index }: { item: TMDBResult; index: number }) => (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 10) * 40)}
      style={[styles.creditCard, { width: CARD_WIDTH, marginRight: (index + 1) % 3 === 0 ? 0 : CARD_GAP }]}
    >
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={() => {
          const mType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
          router.push(`/movie/${item.id}?media_type=${mType}`);
        }}
      >
        <View>
          <Image
            source={{ uri: getImageUrl(item.poster_path, 'w342') }}
            style={[styles.creditImage, { width: CARD_WIDTH, height: CARD_WIDTH * 1.5 }]}
          />
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={9} color={C.gold} />
            <Text style={styles.ratingText}>{(item.vote_average || 0).toFixed(1)}</Text>
          </View>
        </View>
        <Text style={styles.creditTitle} numberOfLines={2}>
          {item.title || item.name}
        </Text>
        {item.character ? (
          <Text style={styles.creditCharacter} numberOfLines={1}>
            {item.character}
          </Text>
        ) : null}
      </TouchableOpacity>
    </Animated.View>
  );

  const renderGalleryModal = () => {
    const imagesToRender =
      personImages.length > 0
        ? personImages
        : person?.profile_path
        ? [{ file_path: person.profile_path, aspect_ratio: 1, height: 0, width: 0 }]
        : [];

    return (
      <Modal
        visible={galleryVisible}
        transparent
        onRequestClose={() => setGalleryVisible(false)}
        animationType="fade"
        statusBarTranslucent
      >
        <View style={[styles.modalContainer, { width, height }]}>
          <StatusBar hidden />

          <View style={styles.modalHeader}>
            <TouchableOpacity activeOpacity={0.95} style={styles.glassBtn} onPress={() => setGalleryVisible(false)}>
              <Ionicons name="close" size={22} color={C.white} />
            </TouchableOpacity>

            <Text style={styles.galleryCounter}>
              {currentImageIndex + 1} / {imagesToRender.length}
            </Text>

            <TouchableOpacity activeOpacity={0.95} style={styles.glassBtn} onPress={handleGalleryShare}>
              <Ionicons name="share-outline" size={19} color={C.white} />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1, justifyContent: 'center' }}>
            <FlatList
              ref={mainGalleryRef}
              data={imagesToRender}
              horizontal
              pagingEnabled
              initialScrollIndex={currentImageIndex}
              getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
              showsHorizontalScrollIndicator={false}
              keyExtractor={(_, index) => `modal-main-${index}`}
              onMomentumScrollEnd={(ev) => {
                const newIndex = Math.round(ev.nativeEvent.contentOffset.x / width);
                setCurrentImageIndex(newIndex);
                thumbnailGalleryRef.current?.scrollToIndex({ index: newIndex, animated: true, viewPosition: 0.5 });
              }}
              renderItem={({ item }) => (
                <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
                  <Image
                    source={{ uri: getImageUrl(item.file_path, 'original') }}
                    style={{ width, height: '100%' }}
                    contentFit="contain"
                  />
                </View>
              )}
            />
          </View>

          {imagesToRender.length > 1 && (
            <View style={styles.thumbnailStripContainer}>
              <FlatList
                ref={thumbnailGalleryRef}
                data={imagesToRender}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(_, index) => `modal-thumb-${index}`}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                renderItem={({ item, index }) => (
                  <TouchableOpacity activeOpacity={0.95}
                    onPress={() => {
                      setCurrentImageIndex(index);
                      mainGalleryRef.current?.scrollToIndex({ index, animated: true });
                    }}
                    style={[styles.thumbnailWrapper, currentImageIndex === index && styles.thumbnailActive]}
                  >
                    <Image source={{ uri: getImageUrl(item.file_path, 'w154') }} style={styles.thumbnailImage} />
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>
      </Modal>
    );
  };

  if (loading || !person) {
    return <CastDetailSkeleton />;
  }

  const headerImages = personImages.length > 0 ? personImages.slice(0, 8) : person.profile_path ? [{ file_path: person.profile_path }] : [];

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <Animated.View style={[styles.headerContainer, headerStyle, { width }]}>
        <Animated.View style={[StyleSheet.absoluteFill, imageContainerStyle]}>
          <FlatList
            ref={headerListRef}
            data={headerImages}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, index) => `header-${index}`}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                activeOpacity={0.95}
                onPress={() => {
                  setCurrentImageIndex(index);
                  setGalleryVisible(true);
                }}
              >
                <Image source={{ uri: getImageUrl(item.file_path, 'h632') }} style={{ width, height: '100%' }} contentFit="cover" />
              </TouchableOpacity>
            )}
          />
          <LinearGradient
            colors={['rgba(10,10,11,0.15)', 'transparent', 'rgba(10,10,11,0.6)', C.bg]}
            locations={[0, 0.35, 0.75, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </Animated.View>

        <View style={[styles.topBar, { paddingTop: TOP_BAR_PADDING }]}>
          <TouchableOpacity activeOpacity={0.95} onPress={() => router.back()} style={styles.glassBtn} activeOpacity={0.95}>
            <Ionicons name="chevron-back" size={22} color={C.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLovePress} style={styles.glassBtn} activeOpacity={0.95}>
            <Animated.View style={animatedHeartStyle}>
              <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={20} color={isLiked ? C.red : C.white} />
            </Animated.View>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ height: HEADER_HEIGHT +25 }} />

        <View style={styles.cardTop}>
          {person.known_for_department ? (
            <Text style={styles.heroEyebrow}>{person.known_for_department.toUpperCase()}</Text>
          ) : null}

          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>
              {person.name}
            </Text>
            <TouchableOpacity activeOpacity={0.95} onPress={copyName} style={styles.copyBtn}>
              <Feather name="copy" size={16} color={C.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.metaRow}>
            {person.birthday ? <Text style={styles.metaText}>Born {person.birthday.split('-')[0]}</Text> : null}
            {person.popularity ? (
              <>
                <Text style={styles.metaDot}>·</Text>
                <Ionicons name="flame" size={11} color={C.gold} />
                <Text style={[styles.metaText, { marginLeft: 4 }]}>{Math.round(person.popularity)} popularity</Text>
              </>
            ) : null}
          </View>

          {person.place_of_birth ? (
            <View style={styles.birthplaceRow}>
              <Ionicons name="location-outline" size={13} color={C.mutedSoft} />
              <Text style={styles.birthplaceText} numberOfLines={1}>
                {person.place_of_birth}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity style={styles.playBtn} onPress={handleLovePress} activeOpacity={0.95}>
            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={20} color="#000" />
            <Text style={styles.playBtnText}>{isLiked ? 'Favorited' : 'Add to Favorites'}</Text>
          </TouchableOpacity>

          <View style={styles.actionRow}>
            <TouchableOpacity activeOpacity={0.95} style={styles.actionBtn} onPress={handleGalleryShare}>
              <Feather name="share-2" size={17} color={C.mutedSoft} />
              <Text style={styles.actionBtnText}>Share</Text>
            </TouchableOpacity>
            {personImages.length > 0 && (
              <TouchableOpacity activeOpacity={0.95}
                style={styles.actionBtn}
                onPress={() => {
                  setCurrentImageIndex(0);
                  setGalleryVisible(true);
                }}
              >
                <Ionicons name="images-outline" size={18} color={C.mutedSoft} />
                <Text style={styles.actionBtnText}>Gallery</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Biography</Text>
            <Text style={styles.overviewText} numberOfLines={isBioExpanded ? undefined : 5}>
              {person.biography || 'No biography available for this person.'}
            </Text>
            {person.biography && person.biography.length > 220 && (
              <TouchableOpacity activeOpacity={0.95} onPress={() => setIsBioExpanded(!isBioExpanded)}>
                <Text style={styles.readMore}>{isBioExpanded ? 'Less' : 'Read more'}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Filmography</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{credits.length}</Text>
              </View>
            </View>

            <FlashList
              data={credits}
              renderItem={({ item, index }) => <CreditCard item={item} index={index} />}
              numColumns={3}
              scrollEnabled={false}
              estimatedItemSize={CARD_WIDTH * 1.5 + 60}
              initialNumToRender={9}
            />
          </View>
        </View>
      </Animated.ScrollView>

      {renderGalleryModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },

  headerContainer: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1, overflow: 'hidden', backgroundColor: C.bg },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 100,
  },
  glassBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  heroEyebrow: { color: C.mutedSoft, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 8 },

  cardTop: {
    marginTop: -40,
    backgroundColor: C.bg,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 26,
    fontWeight: '800',
    color: C.white,
    lineHeight: 32,
    letterSpacing: -0.4,
  },
  copyBtn: { padding: 6, marginTop: 4 },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 8 },
  metaText: { color: C.mutedSoft, fontSize: 12.5, fontWeight: '500' },
  metaDot: { color: C.muted, fontSize: 12, marginHorizontal: 4 },

  birthplaceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 18 },
  birthplaceText: { color: C.mutedSoft, fontSize: 12.5, fontWeight: '500' },

  playBtn: {
    backgroundColor: C.white,
    borderRadius: 16,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  playBtnText: { color: '#000', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },

  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 28 },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  actionBtnText: { color: C.mutedSoft, fontSize: 11, fontWeight: '600' },

  section: { marginBottom: 32 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  sectionTitle: { fontSize: 15, color: C.white, fontWeight: '700', letterSpacing: -0.2, marginBottom: 14 },
  countBadge: { backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginTop: -14 },
  countBadgeText: { color: C.mutedSoft, fontSize: 11, fontWeight: '700' },

  overviewText: { color: C.text, fontSize: 14.5, lineHeight: 23 },
  readMore: { color: C.white, fontWeight: '700', marginTop: 8, fontSize: 13 },

  creditCard: { marginBottom: 18 },
  creditImage: { borderRadius: 12, backgroundColor: C.surface2 },
  ratingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: { color: C.white, fontSize: 10, fontWeight: '700' },
  creditTitle: { color: C.white, fontSize: 12, fontWeight: '600', marginTop: 8, lineHeight: 16 },
  creditCharacter: { color: C.muted, fontSize: 11, fontWeight: '400', marginTop: 2 },

  modalContainer: { backgroundColor: C.bg },
  modalHeader: {
    position: 'absolute',
    top: 40,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 100,
  },
  galleryCounter: { color: C.white, fontSize: 14, fontWeight: '600' },
  thumbnailStripContainer: { position: 'absolute', bottom: 40, height: 80, width: '100%' },
  thumbnailWrapper: { marginRight: 10, borderWidth: 2, borderColor: 'transparent', borderRadius: 8, overflow: 'hidden' },
  thumbnailActive: { borderColor: C.gold },
  thumbnailImage: { width: 50, height: 75, backgroundColor: C.surface2 },
});