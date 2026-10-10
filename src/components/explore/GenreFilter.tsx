import React, { memo } from 'react';
import { View, FlatList, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GENRE_DATA, HORIZONTAL_MARGIN } from './ExploreConstants';

interface GenreFilterProps {
  selectedGenre: number;
  onSelectGenre: (id: number) => void;
}

const ESTIMATED_CHIP_WIDTH = 110;

const GenreFilter = memo(({ selectedGenre, onSelectGenre }: GenreFilterProps) => (
  <View style={styles.genreFilterContainer}>
    <FlatList
      horizontal
      data={GENRE_DATA}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.genreFilterContent}
      getItemLayout={(_, index) => ({
        length: ESTIMATED_CHIP_WIDTH,
        offset: (ESTIMATED_CHIP_WIDTH + 10) * index,
        index,
      })}
      initialNumToRender={6}
      maxToRenderPerBatch={4}
      renderItem={({ item }) => {
        const isSelected = selectedGenre === item.id;
        return (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => onSelectGenre(item.id)}
            style={[styles.genreChip, isSelected && styles.genreChipActive]}
          >
            {item.icon ? (
              <Ionicons
                name={item.icon}
                size={15}
                color={isSelected ? '#FFFFFF' : '#AAA'}
                style={styles.genreChipIcon}
              />
            ) : null}
            <Text style={[styles.genreChipText, isSelected && styles.genreChipTextActive]}>
              {item.name}
            </Text>
          </TouchableOpacity>
        );
      }}
      keyExtractor={(item) => `genre-${item.id}`}
    />
  </View>
));

export default GenreFilter;

const styles = StyleSheet.create({
  genreFilterContainer: {
    marginVertical: 14,
    minHeight: 44,
  },
  genreFilterContent: {
    paddingHorizontal: HORIZONTAL_MARGIN,
    gap: 10,
  },
  genreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 22,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#1E1E1E',
  },
  genreChipActive: {
    backgroundColor: '#E50914',
    borderColor: '#E50914',
  },
  genreChipIcon: {
    marginRight: 6,
  },
  genreChipText: {
    color: '#AAA',
    fontSize: 14,
    fontWeight: '400',
  },
  genreChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});