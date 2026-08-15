import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import FormattedMarkdownText from './FormattedMarkdownText';

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
  ordered?: boolean;
}

export const AiStructuredList: React.FC<AiStructuredListProps> = ({
  title,
  text,
  items = [],
  ordered = true,
}) => {
  if (!items || items.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Optional intro commentary */}
      {!!text && (
        <View style={styles.textBubble}>
          <FormattedMarkdownText text={text} style={styles.introText} />
        </View>
      )}

      <View style={styles.listCard}>
        {/* List Header */}
        <LinearGradient
          colors={['rgba(255,59,59,0.12)', 'rgba(255,255,255,0.02)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.cardHeader}
        >
          <View style={styles.headerIconContainer}>
            <Ionicons name="list-circle-outline" size={18} color="#FF4D4D" />
          </View>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {title || 'Key Takeaways & Ranked Points'}
          </Text>
        </LinearGradient>

        {/* List Items */}
        <View style={styles.itemsContainer}>
          {items.map((item, index) => {
            const isObj = typeof item === 'object' && item !== null;
            const itemTitle = isObj ? item.title : String(item);
            const itemSubtitle = isObj ? item.subtitle : undefined;
            const itemValue = isObj ? item.value : undefined;
            const itemTag = isObj ? item.tag : undefined;

            return (
              <View
                key={index}
                style={[
                  styles.itemRow,
                  index === items.length - 1 && styles.lastItemRow,
                ]}
              >
                {/* Index / Bullet Indicator */}
                <View style={styles.indexBadge}>
                  {ordered ? (
                    <Text style={styles.indexText}>{index + 1}</Text>
                  ) : (
                    <Ionicons name="sparkles" size={12} color="#FF6B6B" />
                  )}
                </View>

                {/* Content */}
                <View style={styles.itemContent}>
                  <View style={styles.titleRow}>
                    {!!itemTitle && (
                      <FormattedMarkdownText
                        text={itemTitle}
                        style={styles.itemTitle}
                        baseColor="#FFFFFF"
                        boldColor="#FFF"
                      />
                    )}
                    {!!itemTag && (
                      <View style={styles.tagBadge}>
                        <Text style={styles.tagText}>{itemTag}</Text>
                      </View>
                    )}
                  </View>

                  {!!itemSubtitle && (
                    <FormattedMarkdownText
                      text={itemSubtitle}
                      style={styles.itemSubtitle}
                      baseColor="#AAA"
                    />
                  )}

                  {!!itemValue && (
                    <View style={styles.valueRow}>
                      <Ionicons name="analytics-outline" size={12} color="#4ADE80" />
                      <Text style={styles.valueText}>{itemValue}</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
};

export default AiStructuredList;

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    paddingHorizontal: 12,
  },
  textBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  introText: {
    color: '#DDD',
    fontSize: 14,
    lineHeight: 20,
  },
  listCard: {
    backgroundColor: '#121216',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    gap: 8,
  },
  headerIconContainer: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 59, 59, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  itemsContainer: {
    paddingVertical: 4,
  },
  itemRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    gap: 12,
  },
  lastItemRow: {
    borderBottomWidth: 0,
  },
  indexBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 59, 59, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 59, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  indexText: {
    color: '#FF6B6B',
    fontSize: 11,
    fontWeight: '800',
  },
  itemContent: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  itemTitle: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
    lineHeight: 18,
    flex: 1,
  },
  tagBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  tagText: {
    color: '#DDD',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  itemSubtitle: {
    color: '#AAA',
    fontSize: 12.5,
    lineHeight: 17,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  valueText: {
    color: '#4ADE80',
    fontSize: 11.5,
    fontWeight: '700',
  },
});
