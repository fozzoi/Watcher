import React, { memo } from 'react';
import { View, FlatList, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { GENRE_DATA, HORIZONTAL_MARGIN } from './ExploreConstants';

interface GenreFilterProps {
  selectedGenre: number;
  onSelectGenre: (id: number) => void;
}

const GenreFilter = memo(({ selectedGenre, onSelectGenre }: GenreFilterProps) => (
  <View style={styles.genreFilterContainer}>
    <FlatList
      horizontal
      data={GENRE_DATA}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.genreFilterContent}
      renderItem={({ item }) => (
        <TouchableOpacity 
          activeOpacity={0.7} 
          onPress={() => onSelectGenre(item.id)} 
          style={[styles.genreChip, selectedGenre === item.id && styles.genreChipActive]}
        >
          <Text style={styles.genreChipIcon}>{item.icon}</Text>
          <Text style={[styles.genreChipText, selectedGenre === item.id && styles.genreChipTextActive]}>
            {item.name}
          </Text>
        </TouchableOpacity>
      )}
      keyExtractor={item => `genre-${item.id}`}
    />
  </View>
));

export default GenreFilter;

const styles = StyleSheet.create({
  genreFilterContainer: { marginVertical: 18 },
  genreFilterContent: { paddingHorizontal: HORIZONTAL_MARGIN, gap: 10 },
  genreChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22, backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.15)' },
  genreChipActive: { backgroundColor: '#E50914', borderColor: '#E50914' },
  genreChipIcon: { fontSize: 16, marginRight: 8 },
  genreChipText: { color: '#AAA', fontSize: 14, fontFamily: 'GoogleSansFlex-Regular' },
  genreChipTextActive: { color: '#FFFFFF', fontFamily: 'GoogleSansFlex-Bold' },
});
