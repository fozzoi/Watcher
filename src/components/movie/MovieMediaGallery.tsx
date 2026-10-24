import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  StatusBar,
  Platform,
  ToastAndroid,
  ActivityIndicator,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Image } from 'expo-image';
import { Ionicons, Feather } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { LegendList } from '@legendapp/list/react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TMDBImage, getImageUrl } from '../../tmdb';
import {
  Host,
  HorizontalCenteredHeroCarousel,
  Box,
  Image as ComposeImage,
} from '@expo/ui/jetpack-compose';
import {
  size,
  height,
  background,
  maskClip,
  Shapes,
  clickable,
  fillMaxSize,
} from '@expo/ui/jetpack-compose/modifiers';

interface MovieMediaGalleryProps {
  backdrops?: TMDBImage[];
  posters?: TMDBImage[];
  fallbackBackdrop?: string | null;
  fallbackPoster?: string | null;
  title?: string;
}

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
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<'scenes' | 'posters'>('scenes');
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const previewListRef = useRef<FlatList>(null);

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

  const handleOpenPreview = useCallback((index: number) => {
    setSelectedPreviewIndex(index);
  }, []);

  const handleClosePreview = useCallback(() => {
    setSelectedPreviewIndex(null);
    setDownloading(false);
  }, []);

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const newIndex = Math.round(offsetX / screenWidth);
      if (newIndex >= 0 && newIndex < currentList.length) {
        setSelectedPreviewIndex(newIndex);
      }
    },
    [screenWidth, currentList.length]
  );

  const handlePrevImage = useCallback(() => {
    if (selectedPreviewIndex === null || selectedPreviewIndex <= 0) return;
    const newIndex = selectedPreviewIndex - 1;
    setSelectedPreviewIndex(newIndex);
    previewListRef.current?.scrollToIndex({ index: newIndex, animated: true });
  }, [selectedPreviewIndex]);

  const handleNextImage = useCallback(() => {
    if (selectedPreviewIndex === null || selectedPreviewIndex >= currentList.length - 1) return;
    const newIndex = selectedPreviewIndex + 1;
    setSelectedPreviewIndex(newIndex);
    previewListRef.current?.scrollToIndex({ index: newIndex, animated: true });
  }, [selectedPreviewIndex, currentList.length]);

  const handleDownloadImage = useCallback(async () => {
    if (selectedPreviewIndex === null || !currentList[selectedPreviewIndex]) return;
    const currentItem = currentList[selectedPreviewIndex];
    const url = getImageUrl(currentItem.file_path, 'original');
    setDownloading(true);
    try {
      const FS = FileSystem as any;
      let ext = (url.split('.').pop()?.split('?')[0] || 'jpg').toLowerCase();
      if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
        ext = 'jpg';
      }
      const cleanTitle = (title || 'watcher').replace(/[^a-z0-9]/gi, '_').substring(0, 30);
      const filename = `${cleanTitle}_${selectedPreviewIndex + 1}_${Date.now()}.${ext}`;
      const cacheDir = FS.cacheDirectory || FS.documentDirectory || '';
      const tempFileUri = `${cacheDir}${filename}`;

      const downloadRes = await FS.downloadAsync(url, tempFileUri);
      if (downloadRes.status !== 200) {
        showToast('Failed to download image.');
        return;
      }

      let savedDirectly = false;
      // 1. Save directly into Download/Watcher/image/ on Android
      if (Platform.OS === 'android') {
        try {
          const downloadDir = 'file:///storage/emulated/0/Download/Watcher/image/';
          await FS.makeDirectoryAsync(downloadDir, { intermediates: true });
          const targetUri = `${downloadDir}${filename}`;
          await FS.copyAsync({ from: tempFileUri, to: targetUri });
          savedDirectly = true;
        } catch (directErr) {
          console.warn('Direct save to Download/Watcher/image failed:', directErr);
        }
      }

      // 2. Also register into MediaLibrary / Photos under 'Watcher' album (requesting ONLY photo permissions)
      let savedToMediaLibrary = false;
      try {
        let perm = await MediaLibrary.getPermissionsAsync();
        if (!perm.granted) {
          perm = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
        }
        if (perm.granted) {
          const asset = await MediaLibrary.createAssetAsync(tempFileUri);
          try {
            const album = await MediaLibrary.getAlbumAsync('Watcher');
            if (album) {
              await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
            } else {
              await MediaLibrary.createAlbumAsync('Watcher', asset, false);
            }
          } catch {}
          savedToMediaLibrary = true;
        }
      } catch (mlErr) {
        console.warn('MediaLibrary save error:', mlErr);
      }

      if (savedDirectly || savedToMediaLibrary) {
        showToast('Saved to Download/Watcher/image!');
        return;
      }

      // 3. StorageAccessFramework: direct write into user's Download directory
      const SAF = FS.StorageAccessFramework;
      if (Platform.OS === 'android' && SAF) {
        try {
          const STORAGE_KEY = 'watcher_image_saf_dir';
          let targetDirUri = await AsyncStorage.getItem(STORAGE_KEY);
          if (!targetDirUri) {
            const initialUri = SAF.getUriForDirectoryInRoot('Download');
            const perm = await SAF.requestDirectoryPermissionsAsync(initialUri);
            if (perm.granted && perm.directoryUri) {
              targetDirUri = perm.directoryUri;
              await AsyncStorage.setItem(STORAGE_KEY, perm.directoryUri);
            }
          }

          if (targetDirUri) {
            const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
            const safFileUri = await SAF.createFileAsync(targetDirUri, filename, mimeType);
            const base64Data = await FS.readAsStringAsync(tempFileUri, { encoding: FS.EncodingType.Base64 });
            await SAF.writeAsStringAsync(safFileUri, base64Data, { encoding: FS.EncodingType.Base64 });
            showToast('Saved to Download/Watcher/image!');
            return;
          }
        } catch (safErr) {
          console.warn('SAF image write error:', safErr);
        }
      }

      // 4. Fallback only if every direct save mechanism is unavailable or cancelled
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(tempFileUri, {
          mimeType: ext === 'png' ? 'image/png' : 'image/jpeg',
          dialogTitle: 'Save Image',
        });
      } else {
        showToast('Storage permission needed to save image.');
      }
    } catch (error) {
      console.error('handleDownloadImage failed:', error);
      showToast('Could not save image.');
    } finally {
      setDownloading(false);
    }
  }, [selectedPreviewIndex, currentList, title, showToast]);

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
        {Platform.OS === 'android' ? (
          <Host style={{ width: '100%', height: activeTab === 'scenes' ? 180 : 240 }}>
            <HorizontalCenteredHeroCarousel 
              preferredItemWidth={activeTab === 'scenes' ? 320 : 155} 
              itemSpacing={activeTab === 'scenes' ? 12 : 8}
            >
              {currentList.map((item, index) => {
                const isScene = activeTab === 'scenes';
                const cardHeight = isScene ? 180 : 240;
                const imageUrl = getImageUrl(item.file_path, isScene ? 'w780' : 'w500');

                return (
                  <Box
                    key={`compose-${activeTab}-${item.file_path}-${index}`}
                    contentAlignment="center"
                    modifiers={[
                      fillMaxSize(),
                      height(cardHeight),
                      maskClip(Shapes.RoundedCorner(isScene ? 18 : 14)),
                      background('#161618'),
                      clickable(() => handleOpenPreview(index)),
                    ]}
                  >
                    {imageUrl && (
                      <ComposeImage
                        source={{ uri: imageUrl }}
                        contentScale="crop"
                        modifiers={[fillMaxSize()]}
                      />
                    )}
                  </Box>
                );
              })}
            </HorizontalCenteredHeroCarousel>
          </Host>
        ) : (
          <LegendList
            horizontal
            data={currentList}
            recycleItems={false}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            keyExtractor={(item, index) => `${activeTab}-${item.file_path}-${index}`}
            estimatedItemSize={activeTab === 'scenes' ? 332 : 132}
            decelerationRate="normal"
            drawDistance={100}
            renderItem={({ item, index }) => {
              const isScene = activeTab === 'scenes';
              const cardWidth = isScene ? 320 : 120;

              return (
                <TouchableOpacity
                  activeOpacity={0.88}
                  style={[styles.imageCard, { width: cardWidth, height: GALLERY_CARD_HEIGHT }]}
                  onPress={() => handleOpenPreview(index)}
                >
                  <Image
                    source={{ uri: getImageUrl(item.file_path, isScene ? 'w780' : 'w342') }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    cachePolicy="disk"
                    priority="low"
                  />
                  <View style={styles.cardGradient} />
                  <View style={styles.zoomIconWrapper}>
                    <Ionicons name="expand" size={13} color="#FFF" />
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </Animated.View>

      {/* Fullscreen Preview Modal with Swipe Left / Right Paging */}
      <Modal
        visible={selectedPreviewIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={handleClosePreview}
      >
        <View style={styles.modalBackdrop}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />

          {selectedPreviewIndex !== null ? (
            <View style={styles.modalContent}>
              {/* Fullscreen Swipeable Image Paging Carousel */}
              <FlatList
                ref={previewListRef}
                data={currentList}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item, index) => `preview-${activeTab}-${item.file_path}-${index}`}
                initialScrollIndex={selectedPreviewIndex}
                getItemLayout={(_, index) => ({
                  length: screenWidth,
                  offset: screenWidth * index,
                  index,
                })}
                onScrollToIndexFailed={(info) => {
                  setTimeout(() => {
                    previewListRef.current?.scrollToIndex({ index: info.index, animated: false });
                  }, 80);
                }}
                onMomentumScrollEnd={handleScrollEnd}
                renderItem={({ item, index }) => (
                  <View style={[styles.modalPage, { width: screenWidth, height: screenHeight }]}>
                    {/* Tapping dark backdrop dismisses preview */}
                    <TouchableOpacity
                      activeOpacity={1}
                      style={StyleSheet.absoluteFill}
                      onPress={handleClosePreview}
                    />
                    <View style={styles.modalImageContainer} pointerEvents="none">
                      <Image
                        source={{ uri: getImageUrl(item.file_path, 'original') }}
                        style={styles.modalImage}
                        contentFit="contain"
                        cachePolicy="disk"
                        priority={Math.abs(index - selectedPreviewIndex) <= 1 ? 'high' : 'normal'}
                      />
                    </View>
                  </View>
                )}
              />

              {/* Floating Bottom Control Dock */}
              <View style={styles.bottomDockContainer} pointerEvents="box-none">
                <View style={styles.bottomDock}>
                  {/* Prev Button */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.dockNavBtn, selectedPreviewIndex === 0 && styles.dockNavBtnDisabled]}
                    onPress={handlePrevImage}
                    disabled={selectedPreviewIndex === 0}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={18}
                      color={selectedPreviewIndex === 0 ? C.muted : C.white}
                    />
                  </TouchableOpacity>

                  {/* Image Counter */}
                  <View style={styles.dockCounter}>
                    <Text style={styles.dockCounterText}>
                      {selectedPreviewIndex + 1} / {currentList.length}
                    </Text>
                  </View>

                  {/* Next Button */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[
                      styles.dockNavBtn,
                      selectedPreviewIndex === currentList.length - 1 && styles.dockNavBtnDisabled,
                    ]}
                    onPress={handleNextImage}
                    disabled={selectedPreviewIndex === currentList.length - 1}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={selectedPreviewIndex === currentList.length - 1 ? C.muted : C.white}
                    />
                  </TouchableOpacity>

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
  },
  modalContent: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  modalPage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImageContainer: {
    width: '100%',
    height: '74%',
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#353540',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  dockNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  dockNavBtnDisabled: {
    opacity: 0.35,
  },
  dockCounter: {
    paddingHorizontal: 8,
    minWidth: 48,
    alignItems: 'center',
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
