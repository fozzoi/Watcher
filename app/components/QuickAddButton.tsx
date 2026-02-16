import React, { memo } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface QuickAddButtonProps {
  isAdded: boolean;
  onPress: () => void;
}

const QuickAddButton = memo(({ isAdded, onPress }: QuickAddButtonProps) => (
  <TouchableOpacity
    activeOpacity={0.7}
    onPress={(e) => { e.stopPropagation(); onPress(); }}
    style={styles.quickAddWrapper}
    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
  >
    <Ionicons name={isAdded ? "bookmark" : "bookmark-outline"} size={20} color={isAdded ? "#E50914" : "#FFFFFF"} />
  </TouchableOpacity>
));

export default QuickAddButton;

const styles = StyleSheet.create({
  quickAddWrapper: { 
    width: 36, height: 36, borderRadius: 18, 
    backgroundColor: 'rgba(0,0,0,0.6)', 
    justifyContent: 'center', alignItems: 'center', 
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' 
  },
});