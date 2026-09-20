// src/components/aichat/AiComparisonTable.tsx
import React, { memo, useMemo, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import FormattedMarkdownText from './FormattedMarkdownText';
import { ai } from './aiTheme';

interface AiComparisonTableProps {
  title?: string;
  text?: string;
  headers: string[];
  rows: (string | number)[][];
}

const OUTER_PAD = 16; // container paddingHorizontal (matches chat gutter)
const CHAR_PX = 6.6;
const strip = (s: string) => s.replace(/[*_`~]/g, '');
const isWin = (s: string) => /^(yes|winner|✓|✔)$/i.test(s.trim()) || s.trim().startsWith('🏆');

export const AiComparisonTable = memo(({ title, text, headers = [], rows = [] }: AiComparisonTableProps) => {
  const { width: winW } = useWindowDimensions();
  const [atEnd, setAtEnd] = useState(false);

  const heads = useMemo(() => (headers ?? []).map((h) => String(h ?? '')), [headers]);
  const data = useMemo(
    () =>
      (rows ?? [])
        .filter(Array.isArray)
        .map((r) => heads.map((_, i) => String(r[i] ?? '').trim() || '—')),
    [rows, heads]
  );

  const available = winW - OUTER_PAD * 2 - 2;

  // Column widths follow the content, then stretch to fill the card if there's room.
  const widths = useMemo(() => {
    const w = heads.map((h, c) => {
      const longest = Math.max(strip(h).length, ...data.map((r) => strip(r[c]).length));
      const [min, max] = c === 0 ? [104, 150] : [96, 200];
      return Math.min(max, Math.max(min, Math.round(longest * CHAR_PX) + 26));
    });
    const total = w.reduce((a, b) => a + b, 0);
    if (total > 0 && total < available) {
      const k = available / total;
      return w.map((x) => Math.floor(x * k));
    }
    return w;
  }, [heads, data, available]);

  if (!heads.length || (!data.length && !text)) return null;

  const total = widths.reduce((a, b) => a + b, 0);
  const overflow = total > available + 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const end = contentOffset.x + layoutMeasurement.width >= contentSize.width - 6;
    if (end !== atEnd) setAtEnd(end);
  };

  return (
    <View style={styles.container}>
      {!!text && (
        <View style={styles.textBubble}>
          <FormattedMarkdownText text={text} style={styles.introText} selectable />
        </View>
      )}

      {data.length > 0 && (
        <View style={styles.card}>
          {!!title && (
            <View style={styles.titleRow}>
              <Ionicons name="swap-horizontal" size={15} color={ai.accent} />
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            </View>
          )}

          <View>
            <ScrollView
              horizontal
              nestedScrollEnabled
              bounces={false}
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={32}
              onScroll={overflow ? onScroll : undefined}
            >
              <View>
                <View style={styles.headRow}>
                  {heads.map((h, c) => (
                    <View key={c} style={[styles.cell, c === 0 && styles.firstCell, { width: widths[c] }]}>
                      <FormattedMarkdownText text={h || ' '} style={styles.headText} baseColor={ai.textMute} />
                    </View>
                  ))}
                </View>

                {data.map((row, r) => (
                  <View key={r} style={[styles.row, r === data.length - 1 && styles.rowLast]}>
                    {row.map((cell, c) => {
                      const win = c > 0 && isWin(cell);
                      return (
                        <View key={c} style={[styles.cell, c === 0 && styles.firstCell, { width: widths[c] }]}>
                          <FormattedMarkdownText
                            text={cell}
                            style={[styles.cellText, c === 0 && styles.firstColText, win && styles.winText]}
                            baseColor={c === 0 ? '#FFFFFF' : win ? ai.accentText : ai.textDim}
                          />
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>

            {overflow && !atEnd && (
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(20,20,24,0)', ai.card]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.fade}
              />
            )}
          </View>
        </View>
      )}
    </View>
  );
});

AiComparisonTable.displayName = 'AiComparisonTable';
export default AiComparisonTable;

const styles = StyleSheet.create({
  container: { marginVertical: 6, paddingHorizontal: OUTER_PAD },
  textBubble: { marginBottom: 10 },
  introText: { color: '#E8E8E8', fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: ai.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ai.border,
    overflow: 'hidden',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  headRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: ai.accentLine,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  rowLast: { borderBottomWidth: 0 },
  cell: { paddingHorizontal: 10, paddingVertical: 10, justifyContent: 'center' },
  firstCell: { paddingLeft: 14 },
  headText: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  cellText: { fontSize: 13, lineHeight: 18 },
  firstColText: { fontWeight: '600' },
  winText: { fontWeight: '700' },
  fade: { position: 'absolute', top: 0, right: 0, bottom: 0, width: 28 },
});