// src/components/shared/QuickAddButton.tsx
import React, { memo, useCallback } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { useSelector } from '@legendapp/state/react';
import { savedStore$, toggleWatchlistGlobal } from '../../state/savedState';
import { useAppTheme } from '../../theme';

interface QuickAddButtonProps {
  itemId?: number;
  item?: any;
  isAdded?: boolean;
  onPress?: () => void;
  /** Bare white heart with no chip — for hearts sitting directly on poster artwork. */
  plain?: boolean;
}

/**
 * Watchlist heart.
 *
 * Design rules (rebuilt):
 *  - The icon is white (#FFF) when NOT saved — nothing theme-dependent, so no
 *    light-mode failure state.
 *  - Saved: Watcher red (colors.primary) + filled shape — clear, branded feedback.
 *  - plain variant: bare icon + a dark drop-shadow halo so white survives
 *    light posters / bright key art.
 *  - chip variant: dark frosted circle so the white icon stays readable when
 *    the heart sits inline on top of the hero scrim.
 */
const QuickAddButton = memo(
  ({ itemId, item, isAdded: propIsAdded, onPress, plain = false }: QuickAddButtonProps) => {
    const { colors } = useAppTheme();
    const targetId = itemId ?? item?.id ?? item?.media_id;
    const numId = targetId !== undefined && targetId !== null ? Number(targetId) : undefined;

    // Reactively track watchlist status from savedStore$ whenever an item ID is available
    const reactiveIsAdded = useSelector(() => {
      if (numId === undefined || isNaN(numId)) return false;
      const current = savedStore$.savedIds.get();
      return current ? current.has(numId) : false;
    });

    // Prefer propIsAdded when explicitly provided by parent; otherwise fall back to reactive state
    const isAdded = propIsAdded !== undefined ? propIsAdded : reactiveIsAdded;

    const handlePress = useCallback(
      (e: any) => {
        e.stopPropagation();
        if (onPress) {
          onPress();
        } else if (item) {
          toggleWatchlistGlobal(item);
        }
      },
      [onPress, item]
    );

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handlePress}
        style={[styles.wrapper, plain ? styles.plain : styles.chip]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={isAdded ? 'Remove from watchlist' : 'Add to watchlist'}
        accessibilityState={{ selected: isAdded }}
      >
        <MaterialIcons
          name={isAdded ? 'favorite' : 'favorite-outline'}
          size={22}
          color={isAdded ? colors.primary : '#FFFFFF'}
        />
      </TouchableOpacity>
    );
  }
);

export default QuickAddButton;

const styles = StyleSheet.create({
  wrapper: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Bare icon over artwork — dark halo keeps white legible on bright posters.
  plain: {
    filter: [
      {
        dropShadow: {
          offsetX: 0,
          offsetY: 1,
          standardDeviation: 2.5,
          color: 'rgba(0, 0, 0, 0.65)',
        },
      },
    ],
  },
  // Inline chip (hero) — dark frosted circle behind the white icon.
  chip: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
