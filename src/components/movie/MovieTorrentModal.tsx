import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  TextInput,
  Linking,
  Dimensions,
  Platform,
  ToastAndroid,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { searchTorrents, TorrentResult } from '../../Scraper';
import { logTasteEvent, TASTE_WEIGHTS } from '../../services/tasteProfile';
import { useAppTheme } from '../../theme';
import {
  Host,
  LoadingIndicator as ComposeLoadingIndicator,
  CircularProgressIndicator,
} from '@expo/ui/jetpack-compose';
import { size } from '@expo/ui/jetpack-compose/modifiers';
import { LoadingIndicator } from '../shared/LoadingIndicator';

interface MovieTorrentModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  year?: string;
  mediaType?: string;
  tmdbId?: number;
  genres?: any[];
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const C = {
  bg: '#0D0D10',
  surface: '#151518',
  surface2: '#1E1E24',
  border: '#282832',
  white: '#FAFAFA',
  text: '#E5E5EB',
  muted: '#8A8A96',
  mutedSoft: '#A8A8B6',
  red: '#E50914',
  green: '#30D158',
  yellow: '#FFD60A',
  blue: '#3B82F6',
};

const getQualityInfo = (name: string): { label: string; color: string; bg: string } => {
  const lower = name.toLowerCase();
  if (lower.includes('2160p') || lower.includes('4k')) {
    return { label: '4K UHD', color: '#22C55E', bg: 'rgba(34, 197, 94, 0.15)' };
  }
  if (lower.includes('1080p')) {
    return { label: '1080p FHD', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)' };
  }
  if (lower.includes('720p')) {
    return { label: '720p HD', color: '#F97316', bg: 'rgba(249, 115, 22, 0.15)' };
  }
  return { label: 'SD', color: '#9CA3AF', bg: 'rgba(156, 163, 175, 0.15)' };
};

const MovieTorrentModal: React.FC<MovieTorrentModalProps> = ({
  visible,
  onClose,
  title,
  year,
  tmdbId,
  genres,
}) => {
  const { colors, isDark } = useAppTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<TorrentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingHash, setDownloadingHash] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 3000);
    }
  }, []);

  const runSearch = useCallback(async (queryToSearch: string) => {
    const q = queryToSearch.trim();
    if (!q) return;
    setLoading(true);
    try {
      const scraped = await searchTorrents(q);
      const sorted = (scraped || []).sort((a, b) => (b.seeds || 0) - (a.seeds || 0));
      setResults(sorted);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible && title) {
      const initialQuery = `${title} ${year || ''}`.trim();
      setSearchQuery(initialQuery);
      runSearch(initialQuery);
    } else if (!visible) {
      setResults([]);
      setLoading(false);
      setDownloadingHash(null);
    }
  }, [visible, title, year, runSearch]);

  const handleOpenMagnet = useCallback(async (magnetUrl: string) => {
    if (tmdbId) {
      logTasteEvent({
        entity_type: 'download',
        entity_id: tmdbId,
        entity_name: title,
        genres,
        weight: TASTE_WEIGHTS.TORRENT_DOWNLOAD,
      });
    }
    try {
      const supported = await Linking.canOpenURL(magnetUrl);
      if (supported) {
        await Linking.openURL(magnetUrl);
      } else {
        await Clipboard.setStringAsync(magnetUrl);
        showToast('Magnet copied! Open in your torrent client (e.g. Flud).');
      }
    } catch {
      await Clipboard.setStringAsync(magnetUrl);
      showToast('Magnet link copied to clipboard!');
    }
  }, [showToast, tmdbId, title, genres]);

  const handleCopyMagnet = useCallback(async (magnetUrl: string) => {
    await Clipboard.setStringAsync(magnetUrl);
    showToast('Magnet link copied to clipboard!');
  }, [showToast]);

  const handleShareAsFile = useCallback(async (url: string, fileName: string) => {
    if (tmdbId) {
      logTasteEvent({
        entity_type: 'download',
        entity_id: tmdbId,
        entity_name: title,
        genres,
        weight: TASTE_WEIGHTS.TORRENT_DOWNLOAD,
      });
    }
    const match = url.match(/urn:btih:([a-fA-F0-9]{40})/i);
    if (!match) {
      showToast('No valid hash found in magnet link.');
      return;
    }

    const hash = match[1].toUpperCase();
    setDownloadingHash(hash);

    const FS = FileSystem as any;
    try {
      const cleanName = fileName.replace(/[^a-z0-9]/gi, '_').substring(0, 60);
      const fileUri = `${FS.documentDirectory || FS.cacheDirectory}${cleanName}.torrent`;
      const torrentUrl = `https://watcher-api-rho.vercel.app/api/torrent-file?hash=${hash}`;

      const downloadRes = await FS.downloadAsync(torrentUrl, fileUri);
      const fileInfo = await FS.getInfoAsync(fileUri);
      const fileSize = fileInfo.exists ? (fileInfo as any).size ?? 0 : 0;

      if (downloadRes.status !== 200 || fileSize < 40) {
        await FS.deleteAsync(fileUri, { idempotent: true });
        showToast("Not in cache yet. Tap 'Magnet' to open directly.");
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/x-bittorrent',
          dialogTitle: 'Share .torrent file',
          UTI: 'com.bittorrent.torrent',
        });
      } else {
        showToast(`Saved torrent file to: ${fileUri}`);
      }
    } catch {
      showToast("Couldn't download .torrent file. Use 'Magnet' instead.");
    } finally {
      setDownloadingHash(null);
    }
  }, [showToast]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {/* Grab Handle */}
          <View style={[styles.handleBar, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.headerIconWrapper, { backgroundColor: colors.badgeBg }]}>
                <MaterialCommunityIcons name="cloud-download-outline" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                  Torrent Downloads
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                  {title} {year ? `(${year})` : ''}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.closeBtn, { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.border }]}
                onPress={onClose}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Search Input for query refinement */}
            <View style={[styles.searchBar, { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.border }]}>
              <Ionicons name="search" size={17} color={colors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={() => runSearch(searchQuery)}
                placeholder="Search releases (e.g. 1080p, 4K)..."
                placeholderTextColor={colors.textSecondary}
                returnKeyType="search"
              />
              {loading ? (
                <LoadingIndicator size={20} color={colors.primary} />
              ) : searchQuery ? (
                <TouchableOpacity activeOpacity={0.7} onPress={() => runSearch(searchQuery)}>
                  <Ionicons name="arrow-forward-circle" size={22} color={colors.primary} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Toast Notification Banner (iOS fallback) */}
          {toastMessage ? (
            <View style={[styles.toastBanner, { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.border }]}>
              <Ionicons name="information-circle" size={16} color={colors.warning} style={{ marginRight: 6 }} />
              <Text style={[styles.toastBannerText, { color: colors.text }]}>{toastMessage}</Text>
            </View>
          ) : null}

          {/* Content */}
          {loading && results.length === 0 ? (
            <View style={styles.centerContainer}>
              <LoadingIndicator size={44} color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Searching verified torrent indexers…</Text>
            </View>
          ) : results.length === 0 ? (
            <View style={styles.centerContainer}>
              <MaterialCommunityIcons name="file-search-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No torrents found</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Try adjusting your search query above</Text>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.retryBtn, { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.border }]}
                onPress={() => runSearch(searchQuery)}
              >
                <Ionicons name="refresh" size={16} color={colors.text} style={{ marginRight: 6 }} />
                <Text style={[styles.retryBtnText, { color: colors.text }]}>Retry Search</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item, index) => `${item.url}-${index}`}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const quality = getQualityInfo(item.name);
                const seeds = item.seeds || 0;
                let seedColor = C.red;
                if (seeds > 40) seedColor = C.green;
                else if (seeds > 10) seedColor = C.yellow;

                const match = item.url.match(/urn:btih:([a-fA-F0-9]{40})/i);
                const hash = match ? match[1].toUpperCase() : null;
                const isDownloadingThis = downloadingHash === hash;

                return (
                  <View style={[styles.card, { backgroundColor: colors.surfaceContainer, borderColor: colors.border }]}>
                    {/* Top Row: Title & Quality */}
                    <View style={styles.cardHeader}>
                      <View style={[styles.qualityBadge, { backgroundColor: quality.bg, borderColor: quality.color + '40' }]}>
                        <Text style={[styles.qualityText, { color: quality.color }]}>{quality.label}</Text>
                      </View>
                      {item.source ? (
                        <View style={[styles.sourceBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
                          <Text style={[styles.sourceText, { color: colors.textSecondary }]}>{item.source}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Torrent Title */}
                    <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
                      {item.name}
                    </Text>

                    {/* Stats Row */}
                    <View style={styles.statsRow}>
                      <View style={styles.statPill}>
                        <Feather name="arrow-up" size={12} color={seedColor} />
                        <Text style={[styles.statValue, { color: seedColor }]}>{seeds} Seeds</Text>
                      </View>

                      <View style={styles.statPill}>
                        <Feather name="arrow-down" size={12} color={colors.textSecondary} />
                        <Text style={[styles.statValue, { color: colors.textSecondary }]}>{item.peers || 0} Peers</Text>
                      </View>

                      <View style={[styles.dotSeparator, { backgroundColor: colors.border }]} />

                      <View style={styles.statPill}>
                        <MaterialCommunityIcons name="harddisk" size={12} color={colors.textSecondary} />
                        <Text style={[styles.sizeText, { color: colors.text }]}>{item.size}</Text>
                      </View>
                    </View>

                    {/* Action Buttons Row */}
                    <View style={styles.cardActionsRow}>
                      {/* Share .torrent file button */}
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={[styles.shareFileBtn, { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.border }]}
                        onPress={() => handleShareAsFile(item.url, item.name)}
                        disabled={isDownloadingThis}
                      >
                        {isDownloadingThis ? (
                          <LoadingIndicator size={16} color={colors.text} />
                        ) : (
                          <>
                            <Feather name="share-2" size={15} color={colors.text} style={{ marginRight: 6 }} />
                            <Text style={[styles.shareFileText, { color: colors.text }]}>Share .torrent</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      {/* Copy Magnet Link Icon Button */}
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={[styles.copyMagnetBtn, { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.border }]}
                        onPress={() => handleCopyMagnet(item.url)}
                      >
                        <Feather name="copy" size={15} color={colors.textSecondary} />
                      </TouchableOpacity>

                      {/* Primary Open Magnet Button */}
                      <TouchableOpacity
                        activeOpacity={0.88}
                        style={[styles.openMagnetBtn, { backgroundColor: colors.primary }]}
                        onPress={() => handleOpenMagnet(item.url)}
                      >
                        <MaterialCommunityIcons name="magnet" size={17} color={colors.onPrimary} style={{ marginRight: 6 }} />
                        <Text style={[styles.openMagnetText, { color: colors.onPrimary }]}>Magnet</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

export default React.memo(MovieTorrentModal);

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: SCREEN_HEIGHT * 0.88,
    backgroundColor: C.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  handleBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#353540',
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(229, 9, 20, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: C.white,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    color: C.mutedSoft,
    fontWeight: '500',
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchInput: {
    flex: 1,
    color: C.white,
    fontSize: 13.5,
    fontWeight: '500',
  },
  toastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface2,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  toastBannerText: {
    color: C.white,
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 60,
  },
  loadingText: {
    color: C.mutedSoft,
    fontSize: 13,
    marginTop: 14,
    fontWeight: '500',
  },
  emptyTitle: {
    color: C.white,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 14,
  },
  emptySubtitle: {
    color: C.muted,
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface2,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    marginTop: 18,
    borderWidth: 1,
    borderColor: C.border,
  },
  retryBtnText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  qualityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  qualityText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  sourceBadge: {
    backgroundColor: C.surface2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sourceText: {
    color: C.mutedSoft,
    fontSize: 10.5,
    fontWeight: '600',
  },
  cardTitle: {
    color: C.white,
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 11.5,
    fontWeight: '600',
    color: C.mutedSoft,
  },
  dotSeparator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: C.muted,
  },
  sizeText: {
    color: C.white,
    fontSize: 11.5,
    fontWeight: '700',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareFileBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface2,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  shareFileText: {
    color: C.text,
    fontSize: 12,
    fontWeight: '600',
  },
  copyMagnetBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  openMagnetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.red,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  openMagnetText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
