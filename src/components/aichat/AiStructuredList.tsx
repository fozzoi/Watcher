// src/components/aichat/AiStructuredList.tsx
import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FormattedMarkdownText from './FormattedMarkdownText';
import { ai } from './aiTheme';

export type ListItem = {
  title?: string;
  subtitle?: string;
  value?: string;
  tag?: string;
};

interface AiStructuredListProps {
  title?: string;
  text?: string;
  items: Array<ListItem | string>;
  /** Numbers only when the order actually means something (rankings, steps). */
  ordered?: boolean;
}

export const AiStructuredList = memo(({ title, text, items = [], ordered = true }: AiStructuredListProps) => {
  const rows = useMemo<ListItem[]>(
    () =>
      (items ?? [])
        .map((it) => (it && typeof it === 'object' ? it : { title: String(it ?? '') }))
        .filter((it) => it.title || it.subtitle),
    [items]
  );

  if (!rows.length) return null;

  return (
    <View style={styles.container}>
      {!!text && (
        <View style={styles.textBubble}>
          <FormattedMarkdownText text={text} style={styles.introText} selectable />
        </View>
      )}

      <View style={styles.card}>
        {!!title && (
          <View style={styles.titleRow}>
            <Ionicons name="list-outline" size={16} color={ai.accent} />
            <Text style={styles.cardTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
        )}

        {rows.map((item, i) => {
          const headline = item.title || item.subtitle || '';
          const detail = item.title ? item.subtitle : undefined;
          return (
            <View key={i} style={[styles.row, i === rows.length - 1 && styles.rowLast]}>
              <View style={styles.lead}>
                {ordered ? <Text style={styles.index}>{i + 1}</Text> : <View style={styles.dot} />}
              </View>

              <View style={styles.body}>
                <FormattedMarkdownText text={headline} style={styles.itemTitle} baseColor="#FFFFFF" />
                {!!detail && (
                  <FormattedMarkdownText text={detail} style={styles.itemSubtitle} baseColor={ai.textDim} />
                )}
                {!!item.tag && (
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>{item.tag}</Text>
                  </View>
                )}
              </View>

              {!!item.value && (
                <Text style={styles.value} numberOfLines={2}>
                  {item.value}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
});

AiStructuredList.displayName = 'AiStructuredList';
export default AiStructuredList;

const styles = StyleSheet.create({
  container: { marginVertical: 6, paddingHorizontal: 12 },
  textBubble: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: ai.border,
  },
  introText: { color: '#DDD', fontSize: 14, lineHeight: 20 },
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
    paddingBottom: 6,
  },
  cardTitle: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  rowLast: { borderBottomWidth: 0 },
  lead: { width: 20, alignItems: 'center', paddingTop: 2 },
  index: { color: ai.accent, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: ai.accent, marginTop: 7 },
  body: { flex: 1, gap: 3 },
  itemTitle: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
  itemSubtitle: { fontSize: 13, lineHeight: 18 },
  tag: {
    alignSelf: 'flex-start',
    marginTop: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: ai.accentSoft,
  },
  tagText: { color: '#FF8A8A', fontSize: 11, fontWeight: '600' },
  value: {
    maxWidth: 96,
    textAlign: 'right',
    color: ai.accentText,
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 18,
  },
});