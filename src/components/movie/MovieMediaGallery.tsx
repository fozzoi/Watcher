import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  StatusBar,
  Dimensions,
  Platform,
  ToastAndroid,
  ActivityIndicator,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Image } from 'expo-image';
import { Ionicons, Feather } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { TMDBImage, getImageUrl } from '../../tmdb';

interface MovieMediaGalleryProps {
  backdrops?: TMDBImage[];
  posters?: TMDBImage[];
  fallbackBackdrop?: string | null;
  fallbackPoster?: string | null;
  title?: string;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GALLERY_CARD_HEIGHT = 180;

const C = {
  surface: '#141416',
  surface2: '#1C1C20',
  white: '#FAFAFA',
  text: '#E8E8EA',
  muted: '#7A7A82',
  mutedSoft: '#9B9BA3',
  red: '#FF453A',
  border: '#24242A',
};

const MovieMediaGallery: React.FC<MovieMediaGalleryProps> = ({
  backdrops = [],
  posters = [],
  fallbackBackdrop,
  fallbackPoster,
  title,
}) => {
  const [activeTab, setActiveTab] = useState<'scenes' | 'posters'>('scenes');
  const [selectedImage, setSelectedImage] = useState<{ url: string; index: number; total: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      setToastMsg(msg);
      setTimeout(() => setToastMsg(null), 2500);
    }
  }, []);

  // Normalize backdrops
  const sceneList = useMemo(() => {
    const list = backdrops.filter((img) => Boolean(img.file_path));
    if (list.length === 0 && fallbackBackdrop) {
      return [{ file_path: fallbackBackdrop, aspect_ratio: 1.78, height: 1080, width: 1920 }];
    }
    return list;
  }, [backdrops, fallbackBackdrop]);

  // Normalize posters
  const posterList = useMemo(() => {
    const list = posters.filter((img) => Boolean(img.file_path));
    if (list.length === 0 && fallbackPoster) {
      return [{ file_path: fallbackPoster, aspect_ratio: 0.67, height: 1500, width: 1000 }];
    }
    return list;
  }, [posters, fallbackPoster]);

  const currentList = activeTab === 'scenes' ? sceneList : posterList;

  const handleOpenPreview = useCallback((filePath: string, index: number, total: number) => {
    setSelectedImage({
      url: getImageUrl(filePath, 'original'),
      index,
      total,
    });
  }, []);

  const handleClosePreview = useCallback(() => {
    setSelectedImage(null);
    setDownloading(false);
  }, []);

  const handleDownloadImage = useCallback(async () => {
    if (!selectedImage) return;
    setDownloading(true);
    try {
      const FS = FileSystem as any;
      const url = selectedImage.url;
      const ext = url.split('.').pop()?.split('?')[0] || 'jpg';
      const cleanTitle = (title || 'watcher').replace(/[^a-z0-9]/gi, '_').substring(0, 30);
      const filename = `${cleanTitle}_${selectedImage.index + 1}_${Date.now()}.${ext}`;
      const fileUri = `${FS.cacheDirectory || FS.documentDirectory}${filename}`;

      const downloadRes = await FS.downloadAsync(url, fileUri);
      if (downloadRes.status !== 200) {
        showToast('Failed to download image.');
        return;
      }

      try {
        const { status } = await MediaLibrary.requestPermissionsAsync(true);
        if (status === 'granted') {
          const ml = MediaLibrary as any;
          if (ml.saveToLibraryAsync) {
            await ml.saveToLibraryAsync(fileUri);
          } else if (ml.createAssetAsync) {
            await ml.createAssetAsync(fileUri);
          }
          showToast('Image saved to Photos / Gallery!');
          return;
        }
      } catch {
        // Fall back to native share sheet if permission denied or unavailable
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        showToast('Image downloaded!');
      }
    } catch {
      showToast('Could not save image.');
    } finally {
      setDownloading(false);
    }
  }, [selectedImage, title, showToast]);

  if (sceneList.length === 0 && posterList.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Photos & Scenes</Text>

        {/* Tab Switcher */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.tabBtn, activeTab === 'scenes' && styles.tabBtnActive]}
            onPress={() => setActiveTab('scenes')}
          >
            <Ionicons
              name="images-outline"
              size={13}
              color={activeTab === 'scenes' ? C.white : C.mutedSoft}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'scenes' && styles.tabBtnTextActive]}>
              Scenes ({sceneList.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.tabBtn, activeTab === 'posters' && styles.tabBtnActive]}
            onPress={() => setActiveTab('posters')}
          >
            <Ionicons
              name="film-outline"
              size={13}
              color={activeTab === 'posters' ? C.white : C.mutedSoft}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.tabBtnText, activeTab === 'posters' && styles.tabBtnTextActive]}>
              Posters ({posterList.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Horizontal Carousel with Smooth Fade Animation & Fixed Height */}
      <Animated.View
        key={activeTab}
        entering={FadeIn.duration(260)}
        style={styles.carouselWrapper}
      >
        <FlatList
          horizontal
          data={currentList}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          keyExtractor={(item, index) => `${activeTab}-${item.file_path}-${index}`}
          renderItem={({ item, index }) => {
            const isScene = activeTab === 'scenes';
            const cardWidth = isScene ? 320 : 120;

            return (
              <TouchableOpacity
                activeOpacity={0.88}
                style={[styles.imageCard, { width: cardWidth, height: GALLERY_CARD_HEIGHT }]}
                onPress={() => handleOpenPreview(item.file_path, index, currentList.length)}
              >
                <Image
                  source={{ uri: getImageUrl(item.file_path, isScene ? 'w780' : 'w500') }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                />
                <View style={styles.cardGradient} />
                <View style={styles.zoomIconWrapper}>
                  <Ionicons name="expand" size={13} color="#FFF" />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </Animated.View>

      {/* Fullscreen Preview Modal */}
      <Modal
        visible={Boolean(selectedImage)}
        transparent
        animationType="fade"
        onRequestClose={handleClosePreview}
      >
        <View style={styles.modalBackdrop}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />

          {/* Touch-to-dismiss background: tapping dark screen dismisses zoom */}
          <TouchableOpacity
            activeOpacity={1}
            style={StyleSheet.absoluteFill}
            onPress={handleClosePreview}
          />

          {selectedImage ? (
            <View style={styles.modalContent} pointerEvents="box-none">
              {/* Image Container - tapping backdrop closes */}
              <TouchableOpacity
                activeOpacity={1}
                style={styles.modalImageContainer}
                onPress={handleClosePreview}
              >
                <Image
                  source={{ uri: selectedImage.url }}
                  style={styles.modalImage}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  priority="high"
                />
              </TouchableOpacity>

              {/* Floating Bottom Control Dock - Centered below image, safe from top notch */}
              <View style={styles.bottomDockContainer} pointerEvents="box-none">
                <View style={styles.bottomDock}>
                  {/* Image Counter */}
                  <View style={styles.dockCounter}>
                    <Text style={styles.dockCounterText}>
                      {selectedImage.index + 1} / {selectedImage.total}
                    </Text>
                  </View>

                  <View style={styles.dockDivider} />

                  {/* Download / Save Button */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={styles.dockActionBtn}
                    onPress={handleDownloadImage}
                    disabled={downloading}
                  >
                    {downloading ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <Feather name="download" size={16} color="#FFF" style={{ marginRight: 6 }} />
                        <Text style={styles.dockActionText}>Save</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <View style={styles.dockDivider} />

                  {/* Close Button */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={styles.dockCloseBtn}
                    onPress={handleClosePreview}
                  >
                    <Ionicons name="close" size={20} color="#FFF" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Transient feedback banner */}
              {toastMsg ? (
                <View style={styles.toastPill}>
                  <Ionicons name="checkmark-circle" size={16} color="#30D158" style={{ marginRight: 6 }} />
                  <Text style={styles.toastPillText}>{toastMsg}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
};

export default React.memo(MovieMediaGallery);

const styles = StyleSheet.create({
  container: {
    marginBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    color: C.white,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: C.border,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  tabBtnActive: {
    backgroundColor: C.surface2,
  },
  tabBtnText: {
    color: C.mutedSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: C.white,
    fontWeight: '700',
  },
  carouselWrapper: {
    height: GALLERY_CARD_HEIGHT,
  },
  listContent: {
    gap: 12,
  },
  imageCard: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    position: 'relative',
  },
  cardGradient: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  zoomIconWrapper: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  bottomDockContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 44 : 28,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  bottomDock: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(28, 28, 34, 0.94)',
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#353540',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  dockCounter: {
    paddingHorizontal: 6,
  },
  dockCounterText: {
    color: C.mutedSoft,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  dockDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#3A3A46',
    marginHorizontal: 8,
  },
  dockActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  dockActionText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  dockCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  toastPill: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 30,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E24',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#353540',
    zIndex: 30,
  },
  toastPillText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
