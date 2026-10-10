import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getImageUrl, type TMDBResult } from '../../tmdb';
import QuickAddButton from '../shared/QuickAddButton';
import { HERO_HEIGHT, HORIZONTAL_MARGIN } from './ExploreConstants';
import { observable } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';

export const heroScroll$ = observable({ isScrolledOut: false });

const MAX_SLIDES = 8;
const AUTOPLAY_MS = 5000;
const C = {
  base: '#0C0D0F',
  text: '#F5F5F5',
  muted: 'rgba(245,245,245,0.7)',
  accent: '#E50914',
  idle: 'rgba(245,245,245,0.3)',
  glass: 'rgba(255,255,255,0.14)',
};
const PAD = 22; // one left/right inset for everything
const RADIUS = 24;

// Liquid indicator geometry
const DOT = 6;
const PITCH = 16; // distance between dot origins
const ACTIVE_W = 14; // resting width of the red blob
const BLOB_INSET = (PITCH - ACTIVE_W) / 2; // centres the blob in its slot, same as the dot
const HIT_H = 32;

type Props = {
  items: TMDBResult[];
  toggleWatchlist: (item: TMDBResult) => void;
  isLoading?: boolean;
};

// ── Liquid indicator ─────────────────────────────────────────────────────────
// One red blob slides over idle dots. Its two edges are separate springs:
// the leading edge shoots ahead, the trailing edge lags, so the blob stretches
// and then snaps back like a droplet. Width/left are layout props, so JS driver.
const LiquidIndicator = memo(function LiquidIndicator({
  items,
  index,
  reduceMotion,
  onSelect,
}: {
  items: TMDBResult[];
  index: number;
  reduceMotion: boolean;
  onSelect: (i: number) => void;
}) {
  const left = useRef(new Animated.Value(index * PITCH + BLOB_INSET)).current;
  const right = useRef(new Animated.Value(index * PITCH + BLOB_INSET + ACTIVE_W)).current;
  const prev = useRef(index);

  useEffect(() => {
    const from = prev.current;
    prev.current = index;
    const toL = index * PITCH + BLOB_INSET;
    const toR = toL + ACTIVE_W;
    left.stopAnimation();
    right.stopAnimation();
    if (reduceMotion || from === index) {
      left.setValue(toL);
      right.setValue(toR);
      return;
    }
    const forward = index > from;
    const fast = { stiffness: 320, damping: 24, mass: 0.7 };
    const slow = { stiffness: 130, damping: 19, mass: 0.9 };
    Animated.parallel([
      Animated.spring(right, { toValue: toR, ...(forward ? fast : slow), useNativeDriver: false }),
      Animated.spring(left, { toValue: toL, ...(forward ? slow : fast), useNativeDriver: false }),
    ]).start();
  }, [index, reduceMotion, left, right]);

  const width = useMemo(() => Animated.subtract(right, left), [left, right]);

  return (
    <View style={{ width: items.length * PITCH, height: HIT_H }}>
      <View style={styles.dotRow}>
        {items.map((item, i) => (
          <Pressable
            key={`${item.id}-${i}`}
            style={styles.dotHit}
            onPress={() => onSelect(i)}
            accessibilityRole="button"
            accessibilityLabel={`Show ${item.title || item.name}`}
            accessibilityState={{ selected: i === index }}
          >
            <View style={styles.dot} />
          </Pressable>
        ))}
      </View>
      <Animated.View pointerEvents="none" style={[styles.blob, { left, width }]} />
    </View>
  );
});

// ── Slide ────────────────────────────────────────────────────────────────────
const FilmLayer = memo(function FilmLayer({ item, active, shouldRender, reduceMotion, width, height, onToggle, onPress }: {
  item: TMDBResult; active: boolean; shouldRender: boolean; reduceMotion: boolean; width: number; height: number;
  onToggle: (item: TMDBResult) => void; onPress: (item: TMDBResult) => void;
}) {
  const opacity = useRef(new Animated.Value(active ? 1 : 0)).current;
  const zoom = useRef(new Animated.Value(1.08)).current;
  const reveal = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    opacity.stopAnimation(); zoom.stopAnimation(); reveal.stopAnimation();
    if (reduceMotion) { opacity.setValue(active ? 1 : 0); zoom.setValue(1); reveal.setValue(active ? 1 : 0); return; }
    if (active) {
      zoom.setValue(1.08); reveal.setValue(0);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(zoom, { toValue: 1, duration: AUTOPLAY_MS + 1200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(180),
          Animated.timing(reveal, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
      ]).start();
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 650, useNativeDriver: true }).start();
    }
    return () => { opacity.stopAnimation(); zoom.stopAnimation(); reveal.stopAnimation(); };
  }, [active, reduceMotion, opacity, zoom, reveal]);

  if (!shouldRender && !active) return null;

  const title = item.title || item.name || '';
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const rating = item.vote_average ? item.vote_average.toFixed(1) : null;
  const kind = item.media_type === 'tv' || item.first_air_date ? 'Series' : 'Film';

  return (
    <Animated.View
      pointerEvents={active ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      style={[StyleSheet.absoluteFill, { opacity }]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: zoom }] }]}>
        <Image source={{ uri: getImageUrl(item.poster_path, 'w780') }} contentFit="cover" cachePolicy="disk" style={{ width, height }} accessible={false} />
      </Animated.View>

      <LinearGradient
        colors={['transparent', 'rgba(12,13,15,0.55)', C.base]}
        locations={[0.2, 0.62, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={() => onPress(item)} accessibilityRole="button" accessibilityLabel={`Open ${title}`} />

      <Animated.View
        pointerEvents="box-none"
        style={[styles.copy, { opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}
      >
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          <QuickAddButton item={item} itemId={item.id} onPress={() => onToggle(item)} />
        </View>
        <View style={styles.meta}>
          {rating ? (
            <View style={styles.rating}>
              <Ionicons name="star" size={12} color={C.text} />
              <Text style={styles.metaText}>{rating}</Text>
            </View>
          ) : null}
          {year ? <Text style={styles.metaText}>{year}</Text> : null}
          <Text style={styles.metaText}>{kind}</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
});

// ── Section ──────────────────────────────────────────────────────────────────
export default memo(function HeroSection({ items, toggleWatchlist, isLoading = false }: Props) {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.max(1, screenWidth - HORIZONTAL_MARGIN * 2);
  const slides = useMemo(() => items.slice(0, MAX_SLIDES), [items]);
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [reduceMotion, setReduceMotion] = useState(true);
  const isScrolledOut = useSelector(() => heroScroll$.isScrolledOut.get());
  const paused = userPaused || dragging || isScrolledOut;
  const activeIndex = slides.length ? Math.min(index, slides.length - 1) : 0;

  useEffect(() => { setIndex((p) => Math.min(p, Math.max(0, slides.length - 1))); }, [slides.length]);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setReduceMotion(v); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const state = AppState.addEventListener('change', (v) => setForeground(v === 'active'));
    return () => { alive = false; motion.remove(); state.remove(); };
  }, []);

  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));

  useEffect(() => {
    if (!focused || !foreground || paused || reduceMotion || isLoading || slides.length < 2) return;
    const t = setTimeout(() => setIndex((p) => (p + 1) % slides.length), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [focused, foreground, paused, reduceMotion, isLoading, slides.length, index]);

  const move = useCallback((d: number) => {
    if (slides.length > 1) setIndex((p) => (p + d + slides.length) % slides.length);
  }, [slides.length]);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 15 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderGrant: () => setDragging(true),
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) > 40) move(g.dx < 0 ? 1 : -1); setDragging(false); },
    onPanResponderTerminate: () => setDragging(false),
  }), [move]);

  const open = useCallback((item: TMDBResult) => {
    const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
    router.push(`/movie/${item.id}?media_type=${mediaType}`);
  }, [router]);

  if (isLoading) return <View style={[styles.root, styles.skeleton, { width, height: HERO_HEIGHT }]} accessibilityLabel="Loading featured films" />;
  if (!slides.length) return null;

  return (
    <View style={[styles.root, { width, height: HERO_HEIGHT }]} {...pan.panHandlers}>
      {slides.map((item, i) => {
        const isNearby = Math.abs(i - activeIndex) <= 1 || (activeIndex === 0 && i === slides.length - 1) || (activeIndex === slides.length - 1 && i === 0);
        return (
          <FilmLayer
            key={`${item.media_type || 'movie'}-${item.id}`}
            item={item}
            active={i === activeIndex}
            shouldRender={isNearby}
            reduceMotion={reduceMotion || !focused || !foreground || isScrolledOut}
            width={width}
            height={HERO_HEIGHT}
            onToggle={toggleWatchlist}
            onPress={open}
          />
        );
      })}

      <View style={styles.controls}>
        <View style={styles.indicatorSlot}>
          <LiquidIndicator items={slides} index={activeIndex} reduceMotion={reduceMotion} onSelect={setIndex} />
        </View>
        <Pressable
          style={styles.pause}
          onPress={() => setUserPaused((v) => !v)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={userPaused ? 'Resume autoplay' : 'Pause autoplay'}
        >
          <Ionicons name={userPaused ? 'play' : 'pause'} size={14} color={C.text} />
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { marginHorizontal: HORIZONTAL_MARGIN, overflow: 'hidden', borderRadius: RADIUS, backgroundColor: C.base },
  skeleton: { opacity: 0.7 },

  // Overlay: one left edge, one rhythm (title, meta, actions, controls)
  copy: { position: 'absolute', left: PAD, right: PAD, bottom: 60, alignItems: 'flex-start', gap: 8 },
  titleRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  title: { flex: 1, color: C.text, fontSize: 22, lineHeight: 27, fontWeight: '700', letterSpacing: -0.4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  metaText: { color: C.muted, fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  controls: { position: 'absolute', left: PAD, right: PAD, bottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  indicatorSlot: { flex: 1, alignItems: 'flex-start' },
  pause: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.glass },

  // Liquid indicator
  dotRow: { flexDirection: 'row' },
  dotHit: { width: PITCH, height: HIT_H, justifyContent: 'center', alignItems: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: C.idle },
  blob: { position: 'absolute', top: (HIT_H - DOT) / 2, height: DOT, borderRadius: DOT / 2, backgroundColor: C.accent },
});