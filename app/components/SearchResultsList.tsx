import React, { memo } from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { getImageUrl, getFullDetails } from '../../src/tmdb';
import MovieCard from './MovieCard';
import { HORIZONTAL_MARGIN } from './ExploreConstants';

interface SearchResultsListProps {
  peopleResults: any[];
  tmdbResults: any[];
  savedIds: Set<number>;
  toggleWatchlist: (item: any) => void;
  navigation: any;
}

const SearchResultsList = memo(({ peopleResults = [], tmdbResults = [], savedIds, toggleWatchlist, navigation }: SearchResultsListProps) => {
  const collections = (tmdbResults || []).filter(r => r.media_type === 'collection');
  const movies = (tmdbResults || []).filter(r => r.media_type !== 'collection');

  return (
    <View style={styles.absoluteContainer}>
      <ScrollView 
        contentContainerStyle={styles.searchScrollContent} 
        keyboardShouldPersistTaps="handled"
      >
        {peopleResults.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={styles.searchHeading}>People</Text>
            <FlatList
              horizontal 
              data={peopleResults} 
              keyExtractor={item => `person-${item.id}`} 
              showsHorizontalScrollIndicator={false} 
              decelerationRate="fast"
              snapToInterval={106} // 90 width + 16 margin
              snapToAlignment="start"
              contentContainerStyle={{ paddingHorizontal: 4 }}
              renderItem={({ item }) => (
                <TouchableOpacity activeOpacity={0.95} style={styles.personItem} onPress={() => navigation.navigate('CastDetails', { personId: item.id })}>
                  <Image source={{ uri: getImageUrl(item.profile_path, 'w185') }} style={styles.personImage} />
                  <Text style={styles.personName} numberOfLines={1}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {collections.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={styles.searchHeading}>Collections</Text>
            <FlatList
              horizontal 
              data={collections} 
              keyExtractor={item => `collection-${item.id}`} 
              showsHorizontalScrollIndicator={false} 
              decelerationRate="fast"
              snapToInterval={172} // Chip width 160 + 12 gap
              snapToAlignment="start"
              contentContainerStyle={{ paddingHorizontal: 4, gap: 12 }}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  activeOpacity={0.95} 
                  style={styles.collectionChip} 
                  onPress={() => navigation.navigate('CollectionDetails', { collectionId: item.id, collectionName: item.name || item.title })}
                >
                  <Image source={{ uri: getImageUrl(item.poster_path, 'w92') }} style={styles.collectionChipImage} />
                  <Text style={styles.collectionChipText} numberOfLines={2}>{item.name || item.title}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {movies.length > 0 && (
          <>
            <Text style={styles.searchHeading}>Movies & Shows</Text>
            <View style={styles.searchResultsGrid}>
              {movies.map((result: any) => (
                <MovieCard
                  key={result.id} item={result} isSearchMode={true} isAdded={savedIds.has(result.id)} toggleWatchlist={toggleWatchlist}
                  onPress={async () => { 
                    const fullDetails = await getFullDetails(result); 
                    navigation.navigate('Detail', { movie: fullDetails }); 
                  }}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
});

export default SearchResultsList;

const styles = StyleSheet.create({
  absoluteContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#141414', zIndex: 20 },
  searchScrollContent: { paddingTop: 20, paddingBottom: 80, paddingHorizontal: HORIZONTAL_MARGIN },
  searchHeading: { color: '#FFFFFF', fontSize: 20, fontFamily: 'GoogleSansFlex-Bold', marginBottom: 16, marginLeft: 4 },
  searchResultsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  personItem: { width: 90, marginRight: 16, alignItems: 'center' },
  personImage: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#222', marginBottom: 8 },
  personName: { color: '#FFFFFF', fontSize: 13, fontFamily: 'GoogleSansFlex-Regular', textAlign: 'center' },
  collectionChip: { 
    width: 160, 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#1E1E1E', 
    borderRadius: 12, 
    paddingRight: 12, 
    overflow: 'hidden', 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.08)' 
  },
  collectionChipImage: { 
    width: 50, 
    height: 50, 
    backgroundColor: '#333' 
  },
  collectionChipText: { 
    flex: 1, 
    color: '#E0E0E0', 
    fontSize: 13, 
    fontFamily: 'GoogleSansFlex-Medium', 
    marginLeft: 10 
  },
});
