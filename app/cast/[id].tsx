import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Share,
  Modal,
  FlatList,
  useWindowDimensions,
  Platform,
  ToastAndroid,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { hasSavedItem, addSavedItem, removeSavedItem, subscribeToSavedItemsChanges } from '../../src/database';
import { toggleWatchlistGlobal, syncSavedStore } from '../../src/state/savedState';
import { logTasteEvent, TASTE_WEIGHTS } from '../../src/services/tasteProfile';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedDialog, DialogButton } from '../../src/components/shared/ThemedDialog';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  FadeInDown,
  withSpring,
  withSequence,
} from 'react-native-reanimated';

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
import { useAppTheme, shadows, getActiveGlowShadow } from '../../src/theme';
import { useImagePalette } from '../../src/utils/colorExtractor';

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

const runAfterTransition = (cb: () => void, delayMs = 320) => {
  let isCancelled = false;
  let rafId: number | null = null;
  const timer = setTimeout(() => {
    if (isCancelled) return;
    rafId = requestAnimationFrame(() => {
      if (!isCancelled) cb();
    });
  }, delayMs);

  return () => {
    isCancelled = true;
    clearTimeout(timer);
    if (rafId !== null) cancelAnimationFrame(rafId);
  };
};

const CreditCard = React.memo(
  ({
    item,
    index,
    cardWidth,
    cardGap,
    onPress,
  }: {
    item: TMDBResult;
    index: number;
    cardWidth: number;
    cardGap: number;
    onPress: (item: TMDBResult) => void;
  }) => {
    const { colors } = useAppTheme();
    const handlePress = useCallback(() => {
      onPress(item);
    }, [onPress, item]);

    const imagePath = item.poster_path || item.backdrop_path;
    const isAnimate = index < 8;

    const content = (
      <TouchableOpacity activeOpacity={0.95} onPress={handlePress}>
        <View style={[styles.creditImageShadow, { width: cardWidth, height: cardWidth * 1.5, backgroundColor: colors.surfaceContainer }]}>
          <Image
            source={{ uri: getImageUrl(imagePath || null, 'w342') }}
            style={[styles.creditImage, { width: cardWidth, height: cardWidth * 1.5, backgroundColor: colors.surfaceContainer }]}
            contentFit="cover"
            cachePolicy="disk"
            transition={150}
            recyclingKey={imagePath || String(item.id)}
          />
        </View>
        <Text style={[styles.creditTitle, { color: colors.text }]} numberOfLines={2}>
          {item.title || item.name}
        </Text>
        {item.character ? (
          <Text style={[styles.creditCharacter, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.character}
          </Text>
        ) : null}
      </TouchableOpacity>
    );

    if (isAnimate) {
      return (
        <Animated.View
          entering={FadeInDown.delay(index * 30).duration(200)}
          style={[
            styles.creditCard,
            { width: cardWidth, marginRight: (index + 1) % 2 === 0 ? 0 : cardGap },
          ]}
        >
          {content}
        </Animated.View>
      );
    }

    return (
      <View
        style={[
          styles.creditCard,
          { width: cardWidth, marginRight: (index + 1) % 2 === 0 ? 0 : cardGap },
        ]}
      >
        {content}
      </View>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.cardWidth === next.cardWidth &&
    prev.cardGap === next.cardGap &&
    prev.onPress === next.onPress
);

export default function CastDetails() {
  const router = useRouter();
  const { colors, isDark, useMaterialYou } = useAppTheme();
  const { id } = useLocalSearchParams();
  const personId = Number(id);
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;
  const isLandscape = width > height;

  const HEADER_HEIGHT = isLandscape ? height * 0.55 : height * 0.65;
  const CARD_GAP = 12;
  const CARD_WIDTH = (width - 40 - CARD_GAP) / 2;

  const [person, setPerson] = useState<TMDBPerson | null>(null);
  const [credits, setCredits] = useState<TMDBResult[]>([]);
  const [personImages, setPersonImages] = useState<TMDBImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBioExpanded, setIsBioExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<'popular' | 'rating' | 'latest'>('popular');

  const [isLiked, setIsLiked] = useState(false);
  const likedScale = useSharedValue(1);

  const [galleryVisible, setGalleryVisible] = useState(false);
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

  const showDialog = useCallback((config: {
    title: string;
    message?: string;
    type?: 'info' | 'success' | 'warning' | 'danger';
    buttons?: DialogButton[];
    iconName?: string;
  }) => {
    setDialogConfig({ ...config, visible: true });
  }, []);

  useEffect(() => {
    loadData();
    checkIfLiked();
    const unsub = subscribeToSavedItemsChanges(() => {
      checkIfLiked();
    });
    return unsub;
  }, [personId]);

  const checkIfLiked = () => {
    setIsLiked(hasSavedItem(personId, 'artist'));
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

      if (personData?.id) {
        logTasteEvent({
          entity_type: 'cast',
          entity_id: personData.id,
          entity_name: personData.name,
          weight: TASTE_WEIGHTS.VISIT_CAST_PAGE,
        });
      }

      const uniqueCredits = creditsData.filter(
        (v, i, a) => a.findIndex((t) => t.id === v.id) === i
      );

      setCredits(uniqueCredits);
    } catch (error) {
      console.error('Error loading person details:', error);
    } finally {
      setLoading(false);
    }
  };

  const sortedCredits = useMemo(() => {
    const list = [...credits];
    if (sortBy === 'popular') {
      return list.sort(
        (a, b) =>
          (b.popularity || 0) - (a.popularity || 0) ||
          (b.vote_count || 0) - (a.vote_count || 0) ||
          (b.vote_average || 0) - (a.vote_average || 0)
      );
    }
    if (sortBy === 'rating') {
      return list.sort(
        (a, b) =>
          (b.vote_average || 0) - (a.vote_average || 0) ||
          (b.vote_count || 0) - (a.vote_count || 0)
      );
    }
    if (sortBy === 'latest') {
      return list.sort((a, b) => {
        const dateA = a.release_date || a.first_air_date || '';
        const dateB = b.release_date || b.first_air_date || '';
        return dateB.localeCompare(dateA);
      });
    }
    return list;
  }, [credits, sortBy]);

  const handleLovePress = useCallback(async () => {
    if (!person) return;
    const newValue = !isLiked;
    setIsLiked(newValue);

    likedScale.value = withSequence(
      withSpring(1.2, { damping: 10, stiffness: 200 }),
      withSpring(1, { damping: 10, stiffness: 200 }),
    );

    try {
      toggleWatchlistGlobal({
        id: person.id,
        name: person.name,
        profile_path: person.profile_path,
        known_for_department: person.known_for_department,
        popularity: person.popularity,
      });
    } catch {
      setIsLiked(!newValue);
    }
  }, [isLiked, person, likedScale]);

  const animatedHeartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likedScale.value }],
  }));

  const handlePageShare = async () => {
    const currentImgPath = personImages[0]?.file_path || person?.profile_path;
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

  const INITIAL_CREDITS = 12;
  const [creditsLimit, setCreditsLimit] = useState(INITIAL_CREDITS);

  // Defer mounting remaining 80+ credits until after the screen slide animation settles
  useEffect(() => {
    if (credits.length <= INITIAL_CREDITS) return;
    const cancelTransition = runAfterTransition(() => {
      setCreditsLimit(credits.length);
    }, 320);
    return () => cancelTransition();
  }, [credits.length]);

  const handleCreditPress = useCallback(
    (item: TMDBResult) => {
      const mType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
      router.push(`/movie/${item.id}?media_type=${mType}`);
    },
    [router]
  );



  if (loading || !person) {
    return <CastDetailSkeleton />;
  }

  const heroImagePath = person.profile_path || (personImages.length > 0 ? personImages[0].file_path : null);
  const heroThumbUrl = heroImagePath ? getImageUrl(heroImagePath, 'w92') : null;
  const { palette } = useImagePalette(heroThumbUrl);

  const detailsBg = palette
    ? (isDark ? palette.ambientDark : palette.ambientLight)
    : colors.background;

  const heroGradientColors: readonly [string, string, ...string[]] = palette
    ? (isDark ? palette.gradientDark : palette.gradientLight)
    : (isDark
        ? ['rgba(10,10,11,0.1)', 'transparent', '#0B0B0E']
        : ['rgba(255,255,255,0.1)', 'transparent', '#F8F9FA']);

  return (
    <View style={[styles.root, { backgroundColor: detailsBg }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? "light-content" : "dark-content"} />

      {/* Lightweight Static Hero Backdrop (Matched with Movie DetailPage) */}
      <View style={[styles.heroContainer, { height: HEADER_HEIGHT, backgroundColor: detailsBg }]} pointerEvents="none">
        <Image
          source={{ uri: getImageUrl(heroImagePath, 'w500') }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="disk"
          priority="high"
        />
        <LinearGradient
          colors={heroGradientColors}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Top Bar HUD */}
      <View style={[styles.topBar, { paddingTop: TOP_BAR_PADDING }]}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => router.back()} style={styles.glassBtn}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        <View style={{ height: HEADER_HEIGHT -30}} />

        <View style={[styles.cardTop, { backgroundColor: detailsBg }]}>
          {person.known_for_department ? (
            <Text style={[styles.heroEyebrow, { color: palette?.bold || colors.primary }]}>{person.known_for_department.toUpperCase()}</Text>
          ) : null}

          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
              {person.name}
            </Text>
            <TouchableOpacity activeOpacity={0.8} onPress={copyName} style={styles.copyBtn}>
              <Feather name="copy" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.metaRow}>
            {person.birthday ? <Text style={[styles.metaText, { color: colors.textSecondary }]}>Born {person.birthday.split('-')[0]}</Text> : null}
            {person.popularity ? (
              <>
                <Text style={[styles.metaDot, { color: colors.textSecondary }]}>·</Text>
                <Ionicons name="flame" size={11} color={C.gold} />
                <Text style={[styles.metaText, { color: colors.textSecondary, marginLeft: 4 }]}>{Math.round(person.popularity)} popularity</Text>
              </>
            ) : null}
          </View>

          {person.place_of_birth ? (
            <View style={styles.birthplaceRow}>
              <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
              <Text style={[styles.birthplaceText, { color: colors.textSecondary }]} numberOfLines={1}>
                {person.place_of_birth}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.playBtn,
              {
                backgroundColor: useMaterialYou
                  ? colors.primary
                  : isDark
                  ? '#FFFFFF'
                  : (colors.surfaceVariant || '#E5E7EB'),
              },
            ]}
            onPress={handleLovePress}
            activeOpacity={0.9}
          >
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={20}
              color={
                useMaterialYou
                  ? colors.onPrimary
                  : isLiked
                  ? '#E50914'
                  : isDark
                  ? '#000000'
                  : colors.text
              }
            />
            <Text
              style={[
                styles.playBtnText,
                {
                  color: useMaterialYou
                    ? colors.onPrimary
                    : isDark
                    ? '#000000'
                    : colors.text,
                },
              ]}
            >
              {isLiked ? 'Favorited' : 'Add to Favorites'}
            </Text>
          </TouchableOpacity>

          <View style={styles.actionRow}>
            <TouchableOpacity activeOpacity={0.8} style={[styles.actionBtn, { backgroundColor: colors.surfaceContainer }]} onPress={handlePageShare}>
              <Feather name="share-2" size={17} color={colors.textSecondary} />
              <Text style={[styles.actionBtnText, { color: colors.text }]}>Share</Text>
            </TouchableOpacity>
            {personImages.length > 0 && (
              <TouchableOpacity activeOpacity={0.8}
                style={[styles.actionBtn, { backgroundColor: colors.surfaceContainer }]}
                onPress={() => {
                  setGalleryVisible(true);
                }}
              >
                <Ionicons name="images-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.actionBtnText, { color: colors.text }]}>Gallery</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Biography</Text>
            <Text style={[styles.overviewText, { color: colors.text }]} numberOfLines={isBioExpanded ? undefined : 5}>
              {person.biography || 'No biography available for this person.'}
            </Text>
            {person.biography && person.biography.length > 220 && (
              <TouchableOpacity activeOpacity={0.8} onPress={() => setIsBioExpanded(!isBioExpanded)}>
                <Text style={[styles.readMore, { color: colors.primary }]}>{isBioExpanded ? 'Less' : 'Read more'}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.sectionHeaderTitle, { color: colors.text }]}>Filmography</Text>
                <View style={[styles.countBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
                  <Text style={[styles.countBadgeText, { color: colors.text }]}>{credits.length}</Text>
                </View>
              </View>

              <View style={styles.sortPillsRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSortBy('popular');
                  }}
                  style={[styles.sortPill, { backgroundColor: colors.surfaceContainer }, sortBy === 'popular' && { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.sortPillText, { color: colors.textSecondary }, sortBy === 'popular' && { color: colors.onPrimary, fontWeight: '700' }]}>
                    Popular
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSortBy('rating');
                  }}
                  style={[styles.sortPill, { backgroundColor: colors.surfaceContainer }, sortBy === 'rating' && { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.sortPillText, { color: colors.textSecondary }, sortBy === 'rating' && { color: colors.onPrimary, fontWeight: '700' }]}>
                    Rating
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSortBy('latest');
                  }}
                  style={[styles.sortPill, { backgroundColor: colors.surfaceContainer }, sortBy === 'latest' && { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.sortPillText, { color: colors.textSecondary }, sortBy === 'latest' && { color: colors.onPrimary, fontWeight: '700' }]}>
                    Latest
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {sortedCredits.slice(0, creditsLimit).map((item, index) => (
                <CreditCard
                  key={`${item.id}-${index}`}
                  item={item}
                  index={index}
                  cardWidth={CARD_WIDTH}
                  cardGap={CARD_GAP}
                  onPress={handleCreditPress}
                />
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      {person && (
        <GalleryModal
          visible={galleryVisible}
          onClose={() => setGalleryVisible(false)}
          personImages={personImages}
          person={person}
        />
      )}
    </View>
  );
}

const GalleryModal = React.memo(({
  visible,
  onClose,
  personImages,
  person
}: {
  visible: boolean;
  onClose: () => void;
  personImages: TMDBImage[];
  person: TMDBPerson;
}) => {
  const { width, height } = useWindowDimensions();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const mainGalleryRef = useRef<FlatList>(null);
  const thumbnailGalleryRef = useRef<FlatList>(null);

  useEffect(() => {
    if (visible) setCurrentImageIndex(0);
  }, [visible]);

  const imagesToRender =
    personImages.length > 0
      ? personImages
      : person?.profile_path
      ? [{ file_path: person.profile_path, aspect_ratio: 1, height: 0, width: 0 }]
      : [];

  const handleGalleryShare = async () => {
    const currentImgPath = imagesToRender[currentImageIndex]?.file_path || person?.profile_path;
    if (!currentImgPath) return;
    const imageUrl = getImageUrl(currentImgPath, 'original');
    try {
      await Share.share({
        message: `Check out ${person?.name}! Shared from Watcher app. ${imageUrl}`,
        url: imageUrl,
      });
    } catch {}
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      onRequestClose={onClose}
      animationType="fade"
      statusBarTranslucent
    >
      <View style={[styles.modalContainer, { width, height }]}>
        <StatusBar hidden />

        <View style={styles.modalHeader}>
          <TouchableOpacity activeOpacity={0.95} style={styles.glassBtn} onPress={onClose}>
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
            initialScrollIndex={0}
            getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, index) => `modal-main-${index}`}
            windowSize={3}
            maxToRenderPerBatch={2}
            initialNumToRender={1}
            onMomentumScrollEnd={(ev) => {
              const newIndex = Math.round(ev.nativeEvent.contentOffset.x / width);
              setCurrentImageIndex(newIndex);
              thumbnailGalleryRef.current?.scrollToIndex({ index: newIndex, animated: true, viewPosition: 0.5 });
            }}
            renderItem={({ item }) => (
              <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
                <Image
                  source={{ uri: getImageUrl(item.file_path, 'original') }}
                  style={{ width: width * 0.9, height: (width * 0.9) * (4 / 3), borderRadius: 16 }}
                  contentFit="cover"
                  cachePolicy="disk"
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
                  <Image source={{ uri: getImageUrl(item.file_path, 'w154') }} style={styles.thumbnailImage} cachePolicy="disk" />
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },

  heroContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    backgroundColor: '#000',
  },

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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  heroEyebrow: { color: C.mutedSoft, fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 8 },

  cardTop: {
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionHeaderTitle: {
    fontSize: 15,
    color: C.white,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sectionTitle: {
    fontSize: 15,
    color: C.white,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 14,
  },
  countBadge: {
    backgroundColor: C.surface2,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  countBadgeText: {
    color: C.mutedSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  sortPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sortPill: {
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  sortPillActive: {
    backgroundColor: C.surface2,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  sortPillText: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  sortPillTextActive: {
    color: C.white,
    fontWeight: '700',
  },

  overviewText: { color: C.text, fontSize: 14.5, lineHeight: 23 },
  readMore: { color: C.white, fontWeight: '700', marginTop: 8, fontSize: 13 },

  creditCard: { marginBottom: 18 },
  creditImageShadow: {
    borderRadius: 12,
    ...shadows.md,
  },
  creditImage: { borderRadius: 12, overflow: 'hidden' },
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