import React, { memo } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { useSelector } from '@legendapp/state/react';
import { savedStore$, toggleWatchlistGlobal } from '../../state/savedState';

interface QuickAddButtonProps {
  itemId?: number;
  item?: any;
  isAdded?: boolean;
  onPress?: () => void;
}

const QuickAddButton = memo(({ itemId, item, isAdded: propIsAdded, onPress }: QuickAddButtonProps) => {
  const targetId = itemId ?? item?.id;
  const reactiveIsAdded = useSelector(() => {
    if (propIsAdded !== undefined || targetId === undefined) return false;
    return savedStore$.savedIds.get().has(targetId);
  });

  const isAdded = propIsAdded !== undefined ? propIsAdded : reactiveIsAdded;

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (item) {
      toggleWatchlistGlobal(item);
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={(e) => { e.stopPropagation(); handlePress(); }}
      style={styles.quickAddWrapper}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <MaterialIcons name={isAdded ? "favorite" : "favorite-outline"} size={25} color={isAdded ? "#E50914" : "#FFFFFF"} />
    </TouchableOpacity>
  );
});

export default QuickAddButton;

const styles = StyleSheet.create({
  quickAddWrapper: { 
    width: 36, height: 36, borderRadius: 18, 
    // backgroundColor: 'rgba(0, 0, 0, 0)', 
    justifyContent: 'center', alignItems: 'center', 
    // borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' 
  },
});