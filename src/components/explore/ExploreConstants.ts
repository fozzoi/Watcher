import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

export const HORIZONTAL_MARGIN = 16;
export const GAP_SIZE = 12;

export const AVAILABLE_WIDTH = width - (HORIZONTAL_MARGIN * 2) - (GAP_SIZE * 2);
export const EXPLORE_CARD_WIDTH = AVAILABLE_WIDTH / 2.5;
export const SEARCH_CARD_WIDTH = (width - HORIZONTAL_MARGIN * 2 - GAP_SIZE) / 3;
export const HERO_CARD_WIDTH = width - HORIZONTAL_MARGIN * 2;
export const HERO_HEIGHT = height * 0.55;

export const GENRE_DATA = [
  { id: 0, name: 'All', icon: '🎬' },
  { id: 28, name: 'Action', icon: '💥' },
  { id: 12, name: 'Adventure', icon: '🗺️' },
  { id: 16, name: 'Animation', icon: '🎨' },
  { id: 35, name: 'Comedy', icon: '😂' },
  { id: 80, name: 'Crime', icon: '🔪' },
  { id: 27, name: 'Horror', icon: '👻' },
  { id: 10749, name: 'Romance', icon: '💕' },
  { id: 878, name: 'Sci-Fi', icon: '🚀' },
  { id: 53, name: 'Thriller', icon: '😱' },
];