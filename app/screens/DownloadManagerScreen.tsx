import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, StatusBar, Modal, ScrollView, Platform, Alert } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { DownloadStore, DownloadItem } from '../../src/utils/downloadManager';
import { VideoInterceptor } from '../../src/utils/VideoInterceptor';
import * as Clipboard from 'expo-clipboard';
import { ToastAndroid } from 'react-native';

const C = {
  bg: '#0A0A0B',
  surface: '#141416',
  surface2: '#1C1C20',
  border: 'rgba(255,255,255,0.06)',
  white: '#FAFAFA',
  text: '#E8E8EA',
  muted: '#7A7A82',
  mutedSoft: '#9B9BA3',
  green: '#30D158',
  gold: '#FFD60A',
  red: '#FF453A',
  ai: '#C9A9FF',
};

const TOP_BAR_PADDING = (StatusBar.currentHeight || 44) + 8;

const DownloadsScreen = () => {
  const navigation = useNavigation();
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [selectedLogsId, setSelectedLogsId] = useState<string | null>(null);

  useEffect(() => {
    setDownloads(DownloadStore.getDownloads());

    const unsubscribe = DownloadStore.subscribe(() => {
      setDownloads([...DownloadStore.getDownloads()]);
    });

    return () => unsubscribe();
  }, []);

  const renderItem = ({ item }: { item: DownloadItem }) => {
    let iconColor = C.gold;
    let iconName: keyof typeof Feather.glyphMap = 'download';

    if (item.status === 'Completed') {
      iconColor = C.green;
      iconName = 'check-circle';
    } else if (item.status === 'Error') {
      iconColor = C.red;
      iconName = 'x-circle';
    } else if (item.status === 'Extracting') {
      iconColor = C.ai;
      iconName = 'loader';
    }

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconBox}>
            <Feather name={iconName} size={18} color={iconColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.status}>
              {item.status} {item.status === 'Downloading' ? `• ${Math.round(item.progress * 100)}%` : ''}
            </Text>
          </View>
          
          <TouchableOpacity activeOpacity={0.95} 
            style={[styles.actionBtn, { marginRight: 8 }]} 
            onPress={() => setSelectedLogsId(item.id)}
          >
            <Feather name="info" size={16} color={C.white} />
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.95} 
            style={[styles.actionBtn, { marginRight: 8 }]}
            onPress={() => {
              Alert.alert(
                "Remove Download",
                `Are you sure you want to remove "${item.title}"?`,
                [
                  { text: "Cancel", style: "cancel" },
                  { 
                    text: "Remove", 
                    style: "destructive", 
                    onPress: () => DownloadStore.removeDownload(item.id) 
                  }
                ]
              );
            }}
          >
            <Feather name="trash-2" size={16} color={C.red} />
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.95} style={styles.actionBtn}>
            <Ionicons name={item.status === 'Completed' ? 'play' : 'pause'} size={16} color={C.white} />
          </TouchableOpacity>
        </View>
        
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: item.status === 'Extracting' ? '100%' : `${item.progress * 100}%`, backgroundColor: iconColor, opacity: item.status === 'Extracting' ? 0.5 : 1 }]} />
        </View>
        <Text style={styles.speed}>{item.speed}</Text>
      </View>
    );
  };

  const selectedItem = downloads.find(d => d.id === selectedLogsId);

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      
      <View style={[styles.topBar, { paddingTop: TOP_BAR_PADDING }]}>
        <TouchableOpacity activeOpacity={0.95} onPress={() => navigation.goBack()} style={styles.glassBtn} activeOpacity={0.95}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Downloads</Text>
        <View style={{ width: 38 }} />
      </View>

      <FlatList
        data={downloads.slice().reverse()}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="download-outline" size={48} color={C.muted} />
            <Text style={styles.emptyText}>No downloads yet.</Text>
          </View>
        }
      />

      {/* Render invisible VideoInterceptors for extracting items */}
      {downloads.filter(d => d.status === 'Extracting').map(d => (
        <VideoInterceptor 
          key={d.id}
          targetUrl={d.url} 
          fileName={d.title} 
          onComplete={() => {}}
          onLog={(msg) => DownloadStore.addLog(d.id, msg)}
          onError={(msg) => {
             DownloadStore.addLog(d.id, `Error: ${msg}`);
             DownloadStore.addOrUpdateDownload(d.id, { status: 'Error' });
          }}
          onSuccess={(url) => {
             DownloadStore.addLog(d.id, `Successfully intercepted! Target: ${url}`);
             DownloadStore.addOrUpdateDownload(d.id, { url, status: 'Downloading' });
             // Start the actual download now!
             import('../../src/utils/downloadManager').then(m => {
                m.startDownload(url, d.title, d.id);
             });
          }}
        />
      ))}

      <Modal visible={!!selectedLogsId} transparent animationType="slide" onRequestClose={() => setSelectedLogsId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Download Debug Logs</Text>
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                <TouchableOpacity activeOpacity={0.95} onPress={() => {
                  const allLogs = selectedItem?.logs?.join('\n') || '';
                  if (allLogs) {
                    Clipboard.setStringAsync(allLogs);
                    if (Platform.OS === 'android') ToastAndroid.show('Logs copied!', ToastAndroid.SHORT);
                  }
                }}>
                  <Feather name="copy" size={20} color={C.white} />
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.95} onPress={() => setSelectedLogsId(null)}>
                  <Feather name="x" size={24} color={C.white} />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView style={styles.logContainer}>
              {selectedItem?.logs?.map((log, i) => (
                <Text key={i} style={styles.logText}>{log}</Text>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  glassBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.white, letterSpacing: -0.2 },
  listContent: { padding: 20, gap: 12 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, padding: 16, borderRadius: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.surface2, justifyContent: 'center', alignItems: 'center' },
  title: { color: C.white, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  status: { color: C.mutedSoft, fontSize: 12, fontWeight: '500' },
  actionBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface2, justifyContent: 'center', alignItems: 'center' },
  progressContainer: { height: 6, backgroundColor: C.surface2, borderRadius: 3, marginTop: 14, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: 3 },
  speed: { color: C.muted, fontSize: 11, marginTop: 8, textAlign: 'right', fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
  emptyText: { color: C.muted, marginTop: 16, fontSize: 15, fontWeight: '500' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: C.surface,
    height: '70%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  modalTitle: {
    color: C.white,
    fontSize: 18,
    fontWeight: '700'
  },
  logContainer: {
    flex: 1,
    backgroundColor: C.surface2,
    borderRadius: 8,
    padding: 12
  },
  logText: {
    color: C.text,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 6
  }
});

export default DownloadsScreen;