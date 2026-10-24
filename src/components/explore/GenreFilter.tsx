import React, { memo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Text,
  StyleSheet,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { GENRE_DATA, HORIZONTAL_MARGIN, GenreItem } from './ExploreConstants';
import { useAppTheme } from '../../theme';

interface GenreFilterProps {
  selectedGenre: number;
  onSelectGenre: (id: number) => void;
}

interface GenreChipItemProps {
  item: GenreItem;
  isSelected: boolean;
  onPress: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
}

const GenreChipItem = memo(({ item, isSelected, onPress, onLayout }: GenreChipItemProps) => {
  const { colors, isDark } = useAppTheme();
  const scale = useSharedValue(isSelected ? 1.04 : 1.0);

  useEffect(() => {
    scale.value = withSpring(isSelected ? 1.04 : 1.0, {
      damping: 15,
      stiffness: 220,
    });
  }, [isSelected, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.93, { damping: 15, stiffness: 350 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(isSelected ? 1.04 : 1.0, { damping: 15, stiffness: 220 });
  };

  return (
    <Animated.View style={animatedStyle} onLayout={onLayout}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.genreChip,
          {
            backgroundColor: isSelected ? colors.primary : colors.surfaceContainer,
            shadowColor: isSelected ? (isDark ? colors.primary : '#000000') : '#000000',
          },
          isSelected && styles.genreChipActive,
        ]}
      >
        {item.icon ? (
          <Ionicons
            name={item.icon}
            size={15}
            color={isSelected ? colors.onPrimary : colors.textSecondary}
            style={styles.genreChipIcon}
          />
        ) : null}
        <Text
          style={[
            styles.genreChipText,
            { color: isSelected ? colors.onPrimary : colors.textSecondary },
            isSelected && styles.genreChipTextActive,
          ]}
        >
          {item.name}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

// Module-level persistence prevents scroll reset during list header rebuilds or tab switches
let persistentScrollX = 0;
const persistentLayouts: Record<number, { x: number; width: number }> = {};

const GenreFilter = memo(({ selectedGenre, onSelectGenre }: GenreFilterProps) => {
  const { width: windowWidth } = useWindowDimensions();
  const scrollRef = useRef<any>(null);
  const isInitialCenteringDone = useRef(false);

  const centerChip = useCallback(
    (genreId: number, animated: boolean = true) => {
      const layout = persistentLayouts[genreId];
      if (layout && scrollRef.current) {
        const targetX = Math.max(0, layout.x - windowWidth / 2 + layout.width / 2);
        scrollRef.current.scrollTo({ x: targetX, animated });
        persistentScrollX = targetX;
      }
    },
    [windowWidth]
  );

  // Magnetically center whenever selectedGenre changes
  useEffect(() => {
    centerChip(selectedGenre, true);
  }, [selectedGenre, centerChip]);

  // Restore persistent scroll offset on mount
  useEffect(() => {
    if (persistentScrollX > 0 && scrollRef.current) {
      scrollRef.current.scrollTo({ x: persistentScrollX, animated: false });
    }
  }, []);

  const handleChipLayout = useCallback(
    (id: number, event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      persistentLayouts[id] = { x, width };

      // Snap-center active chip on initial measurement without jumping
      if (id === selectedGenre && !isInitialCenteringDone.current) {
        isInitialCenteringDone.current = true;
        const targetX = Math.max(0, x - windowWidth / 2 + width / 2);
        scrollRef.current?.scrollTo({ x: targetX, animated: false });
        persistentScrollX = targetX;
      }
    },
    [selectedGenre, windowWidth]
  );

  const handleSelect = useCallback(
    (id: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onSelectGenre(id);
      centerChip(id, true);
    },
    [onSelectGenre, centerChip]
  );

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    persistentScrollX = event.nativeEvent.contentOffset.x;
  };

  return (
    <View style={styles.genreFilterContainer}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.genreFilterContent}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        decelerationRate="normal"
      >
        {GENRE_DATA.map((item) => (
          <GenreChipItem
            key={`genre-${item.id}`}
            item={item}
            isSelected={selectedGenre === item.id}
            onPress={() => handleSelect(item.id)}
            onLayout={(e) => handleChipLayout(item.id, e)}
          />
        ))}
      </ScrollView>
    </View>
  );
});

export default GenreFilter;

const styles = StyleSheet.create({
  genreFilterContainer: {
    marginVertical: 6,
    paddingVertical: 6,
    overflow: 'visible',
  },
  genreFilterContent: {
    paddingHorizontal: HORIZONTAL_MARGIN,
    paddingVertical: 11,
    gap: 10,
    alignItems: 'center',
  },
  genreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 22,
    shadowColor: '#232222',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.03,
    // shadowRadius: 3,
    elevation: 3,
  },
  genreChipActive: {
    // shadowOffset: { width: 0, height: 3 },
    // shadowOpacity: 0.35,
    // shadowRadius: 6,
    // elevation: 4,
  },
  genreChipIcon: {
    marginRight: 6,
  },
  genreChipText: {
    fontSize: 13.5,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  genreChipTextActive: {
    fontWeight: '800',
  },
});