import { ComponentProps } from 'react';
import { Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

export const HORIZONTAL_MARGIN = 16;
export const GAP_SIZE = 12;

export const AVAILABLE_WIDTH = width - (HORIZONTAL_MARGIN * 2) - (GAP_SIZE * 2);
export const EXPLORE_CARD_WIDTH = AVAILABLE_WIDTH / 2.5;
export const SEARCH_CARD_WIDTH = (width - HORIZONTAL_MARGIN * 2 - GAP_SIZE) / 3;
export const HERO_CARD_WIDTH = width - HORIZONTAL_MARGIN * 2;
export const HERO_HEIGHT = height * 0.55;

export type GenreIconName = ComponentProps<typeof Ionicons>['name'];

export interface GenreItem {
  id: number;
  name: string;
  icon: GenreIconName;
}

export const GENRE_DATA: GenreItem[] = [
  { id: 0, name: 'All', icon: 'apps-outline' },
  { id: 28, name: 'Action', icon: 'flash-outline' },
  { id: 12, name: 'Adventure', icon: 'compass-outline' },
  { id: 16, name: 'Animation', icon: 'color-palette-outline' },
  { id: 35, name: 'Comedy', icon: 'happy-outline' },
  { id: 80, name: 'Crime', icon: 'finger-print-outline' },
  { id: 27, name: 'Horror', icon: 'skull-outline' },
  { id: 10749, name: 'Romance', icon: 'heart-outline' },
  { id: 878, name: 'Sci-Fi', icon: 'planet-outline' },
  { id: 53, name: 'Thriller', icon: 'eye-outline' },
];

const GENRE_EXTRA_MAP: Record<string, GenreIconName> = {
  documentary: 'videocam-outline',
  drama: 'film-outline',
  family: 'people-outline',
  fantasy: 'sparkles-outline',
  history: 'time-outline',
  music: 'musical-notes-outline',
  mystery: 'search-outline',
  'science fiction': 'planet-outline',
  'tv movie': 'tv-outline',
  war: 'shield-outline',
  western: 'trail-sign-outline',
  kids: 'happy-outline',
  news: 'newspaper-outline',
  reality: 'tv-outline',
  soap: 'heart-outline',
  talk: 'chatbubbles-outline',
};

export const getGenreIcon = (id?: number, name?: string): GenreIconName => {
  if (id !== undefined) {
    const found = GENRE_DATA.find((g) => g.id === id);
    if (found) return found.icon;
  }
  if (name) {
    const key = name.trim().toLowerCase();
    if (GENRE_EXTRA_MAP[key]) return GENRE_EXTRA_MAP[key];
    const foundByName = GENRE_DATA.find((g) => g.name.toLowerCase() === key);
    if (foundByName) return foundByName.icon;
  }
  return 'film-outline';
};