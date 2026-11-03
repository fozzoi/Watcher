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
export const HERO_HEIGHT = Math.round(height * 0.52);

export type GenreIconName = ComponentProps<typeof Ionicons>['name'];

export interface GenreItem {
  id: number;
  name: string;
  icon: GenreIconName;
}

export const GENRE_DATA: GenreItem[] = [
  { id: 0, name: 'All', icon: 'sparkles-outline' },
  { id: 28, name: 'Action', icon: 'flash-outline' },
  { id: 12, name: 'Adventure', icon: 'compass-outline' },
  { id: 16, name: 'Animation', icon: 'color-palette-outline' },
  { id: 35, name: 'Comedy', icon: 'happy-outline' },
  { id: 80, name: 'Crime', icon: 'finger-print-outline' },
  { id: 27, name: 'Horror', icon: 'skull-outline' },
  { id: 10749, name: 'Romance', icon: 'heart-outline' },
  { id: 878, name: 'Sci-Fi', icon: 'planet-outline' },
  { id: 53, name: 'Thriller', icon: 'pulse-outline' },
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

export const POPULAR_FRANCHISE_COLLECTIONS = [
  {
    id: 726871,
    collection_id: 726871,
    name: 'Dune Collection',
    title: 'Dune Collection',
    backdrop_path: '/fahk0Fu7VUUfK6IkTt1R3waOD9F.jpg',
    poster_path: '/lxIGYkpvYjLtYtZH684AQft0FhD.jpg',
    media_type: 'collection' as const,
    parts_count: 2,
    vote_average: 8.2,
  },
  {
    id: 404609,
    collection_id: 404609,
    name: 'John Wick Collection',
    title: 'John Wick Collection',
    backdrop_path: '/fSwYa5q2xRkBoOOjueLpkLf3N1m.jpg',
    poster_path: '/sm7rZZivZm2NhJDucFf3gpfFdVt.jpg',
    media_type: 'collection' as const,
    parts_count: 4,
    vote_average: 7.9,
  },
  {
    id: 263,
    collection_id: 263,
    name: 'The Dark Knight Collection',
    title: 'The Dark Knight Collection',
    backdrop_path: '/xyhrCEdB4XRkelfVsqXeUZ6rLHi.jpg',
    poster_path: '/ogyw5LTmL53dVxsppcy8Dlm30Fu.jpg',
    media_type: 'collection' as const,
    parts_count: 3,
    vote_average: 8.5,
  },
  {
    id: 119,
    collection_id: 119,
    name: 'The Lord of the Rings Collection',
    title: 'The Lord of the Rings Collection',
    backdrop_path: '/bccR2CGTWVVSZAG0yqmy3DIvhTX.jpg',
    poster_path: '/oENY593nKRVL2PnxXsMtlh8izb4.jpg',
    media_type: 'collection' as const,
    parts_count: 3,
    vote_average: 8.5,
  },
  {
    id: 1241,
    collection_id: 1241,
    name: 'Harry Potter Collection',
    title: 'Harry Potter Collection',
    backdrop_path: '/4gV0rKUjB1nLUdZB4zIltLvNZZr.jpg',
    poster_path: '/eVPs2Y0LyvTLZn6AP5Z6O2rtiGB.jpg',
    media_type: 'collection' as const,
    parts_count: 8,
    vote_average: 7.9,
  },
  {
    id: 86311,
    collection_id: 86311,
    name: 'The Avengers Collection',
    title: 'The Avengers Collection',
    backdrop_path: '/2UNUv4NJdC36E5myDHACBJ99EwL.jpg',
    poster_path: '/yFSIUVTCvgYrpalUktulvk3Gi5Y.jpg',
    media_type: 'collection' as const,
    parts_count: 4,
    vote_average: 8.0,
  },
  {
    id: 10,
    collection_id: 10,
    name: 'Star Wars Collection',
    title: 'Star Wars Collection',
    backdrop_path: '/iY2ujEY2m68OTTlPFTiHub9joHS.jpg',
    poster_path: '/pWVLFh4OuejTpUaDQbB1C4zoS2p.jpg',
    media_type: 'collection' as const,
    parts_count: 9,
    vote_average: 8.1,
  },
  {
    id: 87359,
    collection_id: 87359,
    name: 'Mission: Impossible Collection',
    title: 'Mission: Impossible Collection',
    backdrop_path: '/mroWh717g0Ah2c0rrPGW6f3EWMM.jpg',
    poster_path: '/geEjCGfdmRAA1skBPwojcdvnZ8A.jpg',
    media_type: 'collection' as const,
    parts_count: 7,
    vote_average: 7.6,
  },
  {
    id: 556,
    collection_id: 556,
    name: 'Spider-Man Collection',
    title: 'Spider-Man Collection',
    backdrop_path: '/waZqriYTuBE3WqXI3SDGi3kfDQE.jpg',
    poster_path: '/bp5PqLa06QA1LsELA1SsKZ008H7.jpg',
    media_type: 'collection' as const,
    parts_count: 3,
    vote_average: 7.5,
  },
  {
    id: 295,
    collection_id: 295,
    name: 'Pirates of the Caribbean Collection',
    title: 'Pirates of the Caribbean Collection',
    backdrop_path: '/wxgD3fB5lQ2sGJLog0rvXW049Pf.jpg',
    poster_path: '/zRBaZxS5YauLvRYjAdL4AUCwlht.jpg',
    media_type: 'collection' as const,
    parts_count: 5,
    vote_average: 7.5,
  },
  {
    id: 87096,
    collection_id: 87096,
    name: 'Avatar Collection',
    title: 'Avatar Collection',
    backdrop_path: '/4uwX70EzaWVcGUXMtXPoexlNAff.jpg',
    poster_path: '/3C5brXxnBxfkeKWwA1Fh4xvy4wr.jpg',
    media_type: 'collection' as const,
    parts_count: 3,
    vote_average: 7.8,
  },
  {
    id: 173710,
    collection_id: 173710,
    name: 'Planet of the Apes (Reboot) Collection',
    title: 'Planet of the Apes (Reboot) Collection',
    backdrop_path: '/iMhm0g555HgQNIXAMvnlgOiW5Rz.jpg',
    poster_path: '/afGkMC4HF0YtXYNkyfCgTDLFe6m.jpg',
    media_type: 'collection' as const,
    parts_count: 4,
    vote_average: 7.4,
  },
  {
    id: 2344,
    collection_id: 2344,
    name: 'The Matrix Collection',
    title: 'The Matrix Collection',
    backdrop_path: '/bRm2DEgUiYciDw3myHuYFInD7la.jpg',
    poster_path: '/bV9qTVHTVf0gkW0j7p7M0ILD4pG.jpg',
    media_type: 'collection' as const,
    parts_count: 4,
    vote_average: 7.4,
  },
  {
    id: 9485,
    collection_id: 9485,
    name: 'The Fast and the Furious Collection',
    title: 'The Fast and the Furious Collection',
    backdrop_path: '/z5A5W3WYJc3UVEWljSGwdjDgQ0j.jpg',
    poster_path: '/zOCnMPoUxgJK1RFPfN4PcnT16gr.jpg',
    media_type: 'collection' as const,
    parts_count: 10,
    vote_average: 7.1,
  },
  {
    id: 448150,
    collection_id: 448150,
    name: 'Deadpool Collection',
    title: 'Deadpool Collection',
    backdrop_path: '/dTq7mGyAR5eAydR532feWfjJjzm.jpg',
    poster_path: '/30c5jO7YEXuF8KiWXLg9m28GWDA.jpg',
    media_type: 'collection' as const,
    parts_count: 3,
    vote_average: 7.7,
  },
  {
    id: 328,
    collection_id: 328,
    name: 'Jurassic Park Collection',
    title: 'Jurassic Park Collection',
    backdrop_path: '/njFixYzIxX8jsn6KMSEtAzi4avi.jpg',
    poster_path: '/qIm2nHXLpBBdMxi8dvfrnDkBUDh.jpg',
    media_type: 'collection' as const,
    parts_count: 6,
    vote_average: 7.0,
  },
  {
    id: 313086,
    collection_id: 313086,
    name: 'The Conjuring Collection',
    title: 'The Conjuring Collection',
    backdrop_path: '/kHZaX0vuhZdbuq0WKU3BpA9WIQ0.jpg',
    poster_path: '/z5VKhNSQKQyxm0co68HAkCqHnmX.jpg',
    media_type: 'collection' as const,
    parts_count: 3,
    vote_average: 7.2,
  },
  {
    id: 8945,
    collection_id: 8945,
    name: 'Mad Max Collection',
    title: 'Mad Max Collection',
    backdrop_path: '/zI0q2ENcQOLECbe0gAEGlncVh2j.jpg',
    poster_path: '/tRxkZboyyXnFgCthoViWBwISZ0r.jpg',
    media_type: 'collection' as const,
    parts_count: 5,
    vote_average: 7.2,
  },
];
