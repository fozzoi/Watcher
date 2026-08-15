import React, { useCallback, useEffect, useRef } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  runOnJS,
} from "react-native-reanimated";
import { impactAsync, ImpactFeedbackStyle } from "expo-haptics";
import type { ReactNode } from "react";
import type { ImageSourcePropType } from "react-native";
import type { SharedValue } from "react-native-reanimated";

const { width, height } = Dimensions.get("window");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParallaxCarouselItem {
  image: ImageSourcePropType;
}

export type ParallaxCarouselProps<ItemT extends ParallaxCarouselItem> = {
  data: readonly ItemT[];
  renderItem: (info: { item: ItemT; index: number }) => ReactNode;
  keyExtractor?: (item: ItemT, index: number) => string;
  itemWidth?: number;
  itemHeight?: number;
  spacing?: number;
  parallaxIntensity?: number;
  pagingEnabled?: boolean;
  showHorizontalScrollIndicator?: boolean;
  onMomentumScrollEnd?: (e: any) => void; // ← added for dot tracking
  autoplay?: boolean;
  autoplayInterval?: number;
  loop?: boolean;
};

export interface ParallaxCarouselItemProps<ItemT extends ParallaxCarouselItem> {
  item: ItemT;
  index: number;
  scrollX: SharedValue<number>;
  renderItem: (info: { item: ItemT; index: number }) => ReactNode;
  itemWidth: number;
  itemHeight: number;
  spacing: number;
  parallaxIntensity: number;
}

// ── Single item with parallax image ──────────────────────────────────────────

const ParallaxCarouselItemComponent = <ItemT extends ParallaxCarouselItem>({
  item,
  index,
  scrollX,
  renderItem,
  itemWidth,
  itemHeight,
  spacing,
  parallaxIntensity,
}: ParallaxCarouselItemProps<ItemT>) => {
  const inputRange = [
    (index - 1) * itemWidth,
    index * itemWidth,
    (index + 1) * itemWidth,
  ];

  const imageAnimatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(scrollX.value, inputRange, [
      -itemWidth * parallaxIntensity,
      0,
      itemWidth * parallaxIntensity,
    ]);
    return { transform: [{ translateX }] };
  });

  return (
    <View style={[styles.itemContainer, { width: itemWidth, height: itemHeight }]}>
      <View
        style={[
          styles.imageContainer,
          {
            width: itemWidth - spacing * 2,
            height: itemHeight - spacing * 2,
          },
        ]}
      >
        {item.image && (
          <Animated.Image
            source={item.image}
            style={[
              styles.image,
              {
                // Make image wider than the card so parallax has room to shift
                width: (itemWidth - spacing * 2) * (1 + parallaxIntensity * 2),
                height: itemHeight - spacing * 2,
              },
              imageAnimatedStyle,
            ]}
          />
        )}
      </View>

      {/* Overlay content (gradient, title, buttons etc.) rendered on top */}
      {renderItem({ item, index })}
    </View>
  );
};

// ── Carousel ──────────────────────────────────────────────────────────────────

export const ParallaxCarousel = <ItemT extends ParallaxCarouselItem>({
  data,
  renderItem,
  keyExtractor,
  itemWidth = width,
  itemHeight = height * 0.75,
  spacing = 20,
  parallaxIntensity = 0.25,
  pagingEnabled = true,
  showHorizontalScrollIndicator = false,
  onMomentumScrollEnd,
  autoplay = false,
  autoplayInterval = 4000,
  loop = true,
}: ParallaxCarouselProps<ItemT>) => {
  const scrollX = useSharedValue(0);
  const flatListRef = useRef<any>(null);
  const currentIndexRef = useRef(0);
  const autoplayTimer = useRef<NodeJS.Timeout | null>(null);

  const onSwipeHaptic = useCallback(() => {
    impactAsync(ImpactFeedbackStyle.Rigid);
  }, []);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
    onEndDrag: () => {
      // Haptic feedback on swipe
      runOnJS(onSwipeHaptic)();
    },
  });

  const stopAutoplay = () => {
    if (autoplayTimer.current) {
      clearInterval(autoplayTimer.current);
      autoplayTimer.current = null;
    }
  };

  const startAutoplay = () => {
    stopAutoplay();
    if (!autoplay || !data || data.length < 2) return;
    autoplayTimer.current = setInterval(() => {
      const next = loop
        ? (currentIndexRef.current + 1) % data.length
        : Math.min(currentIndexRef.current + 1, data.length - 1);
      flatListRef.current?.scrollToOffset({ offset: next * itemWidth, animated: true });
      currentIndexRef.current = next;
    }, autoplayInterval);
  };

  const defaultKeyExtractor = (item: ItemT, index: number) =>
    keyExtractor ? keyExtractor(item, index) : `item-${index}`;

  useEffect(() => {
    startAutoplay();
    return () => stopAutoplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, autoplayInterval, data?.length, loop, itemWidth]);

  const handleMomentumEnd = (e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / itemWidth);
    currentIndexRef.current = index;
    if (onMomentumScrollEnd) onMomentumScrollEnd(e);
    // restart autoplay after interaction
    stopAutoplay();
    // small timeout to avoid immediate jump
    setTimeout(() => startAutoplay(), autoplayInterval);
  };

  return (
    <View style={styles.carouselWrapper}>
      <Animated.FlatList
        ref={flatListRef}
        data={data}
        keyExtractor={defaultKeyExtractor}
        horizontal
        pagingEnabled={pagingEnabled}
        showsHorizontalScrollIndicator={showHorizontalScrollIndicator}
        onScroll={onScroll}
        onScrollBeginDrag={() => stopAutoplay()}
        scrollEventThrottle={16}
        style={{ flexGrow: 0 }}
        contentContainerStyle={styles.flatListContent}
        onMomentumScrollEnd={handleMomentumEnd}
        renderItem={({ item, index }) => (
          <ParallaxCarouselItemComponent
            item={item}
            index={index}
            scrollX={scrollX}
            renderItem={renderItem}
            itemWidth={itemWidth}
            itemHeight={itemHeight}
            spacing={spacing}
            parallaxIntensity={parallaxIntensity}
          />
        )}
      />
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  carouselWrapper: {
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
  },
  flatListContent: {
    alignItems: "center",
  },
  itemContainer: {
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
  },
  imageContainer: {
    overflow: "hidden",
    borderRadius: 20,
    backgroundColor: "#1A1A1A",
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    resizeMode: "cover",
  },
});