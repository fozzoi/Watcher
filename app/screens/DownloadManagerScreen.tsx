import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

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
};

const TOP_BAR_PADDING = (StatusBar.currentHeight || 44) + 8;

const DownloadsScreen = () => {
  const navigation = useNavigation();
  const [downloads, setDownloads] = useState([
    { id: '1', title: 'Sample Movie', progress: 0.45, status: 'Downloading', speed: '2.4 MB/s' },
    { id: '2', title: 'Another Show - S01E01', progress: 1.0, status: 'Completed', speed: '0 KB/s' }
  ]);

  const renderItem = ({ item }: any) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconBox}>
          <Feather name={item.progress === 1 ? 'check-circle' : 'download'} size={18} color={item.progress === 1 ? C.green : C.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.status}>{item.status} • {Math.round(item.progress * 100)}%</Text>
        </View>
        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name={item.progress === 1 ? 'play' : 'pause'} size={16} color={C.white} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: `${item.progress * 100}%`, backgroundColor: item.progress === 1 ? C.green : C.gold }]} />
      </View>
      <Text style={styles.speed}>{item.speed}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      
      <View style={[styles.topBar, { paddingTop: TOP_BAR_PADDING }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.glassBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Downloads</Text>
        <View style={{ width: 38 }} />
      </View>

      <FlatList
        data={downloads}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
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
  speed: { color: C.muted, fontSize: 11, marginTop: 8, textAlign: 'right', fontWeight: '600' }
});

export default DownloadsScreen;