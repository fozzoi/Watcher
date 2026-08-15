import React from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import FormattedMarkdownText from './FormattedMarkdownText';

interface AiComparisonTableProps {
  title?: string;
  text?: string;
  headers: string[];
  rows: (string | number)[][];
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const AiComparisonTable: React.FC<AiComparisonTableProps> = ({
  title,
  text,
  headers = [],
  rows = [],
}) => {
  if (!headers || headers.length === 0) return null;

  // Calculate dynamic column width: Minimum 110px or scaled based on count
  const colWidth = Math.max(115, Math.floor((SCREEN_WIDTH - 64) / Math.min(headers.length, 3)));

  return (
    <View style={styles.container}>
      {/* Optional intro commentary */}
      {!!text && (
        <View style={styles.textBubble}>
          <FormattedMarkdownText text={text} style={styles.introText} />
        </View>
      )}

      <View style={styles.tableCard}>
        {/* Table Title Bar */}
        <LinearGradient
          colors={['rgba(255,59,59,0.12)', 'rgba(255,255,255,0.02)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.cardHeader}
        >
          <View style={styles.headerIconContainer}>
            <Ionicons name="swap-horizontal" size={16} color="#FF4D4D" />
          </View>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {title || 'Comparison Breakdown'}
          </Text>
        </LinearGradient>

        {/* Scrollable Table Content */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContainer}
        >
          <View>
            {/* Header Row */}
            <View style={styles.headerRow}>
              {headers.map((header, colIdx) => (
                <View
                  key={colIdx}
                  style={[
                    styles.headerCell,
                    { width: colWidth },
                    colIdx === 0 && styles.firstColCell,
                  ]}
                >
                  <Text style={styles.headerCellText} numberOfLines={2}>
                    {String(header).toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>

            {/* Data Rows */}
            {rows.map((row, rowIdx) => {
              const isEven = rowIdx % 2 === 0;
              return (
                <View
                  key={rowIdx}
                  style={[
                    styles.dataRow,
                    isEven ? styles.evenRow : styles.oddRow,
                    rowIdx === rows.length - 1 && styles.lastRow,
                  ]}
                >
                  {row.map((cell, colIdx) => {
                    const isFirstCol = colIdx === 0;
                    const cellStr = String(cell ?? '—');
                    const isHighlight =
                      !isFirstCol &&
                      (cellStr.includes('$') ||
                        cellStr.includes('%') ||
                        cellStr.includes('/10') ||
                        cellStr.includes('★') ||
                        cellStr.toLowerCase() === 'yes' ||
                        cellStr.toLowerCase() === 'winner');

                    return (
                      <View
                        key={colIdx}
                        style={[
                          styles.dataCell,
                          { width: colWidth },
                          isFirstCol && styles.firstColCell,
                        ]}
                      >
                        {isHighlight ? (
                          <View style={styles.highlightBadge}>
                            <FormattedMarkdownText
                              text={cellStr}
                              style={styles.highlightText}
                              baseColor="#4ADE80"
                            />
                          </View>
                        ) : (
                          <FormattedMarkdownText
                            text={cellStr}
                            style={[
                              styles.cellText,
                              isFirstCol && styles.firstColText,
                            ]}
                            baseColor={isFirstCol ? '#FFF' : '#CCC'}
                          />
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

export default AiComparisonTable;

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
  tableCard: {
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
  scrollContainer: {
    paddingVertical: 4,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 59, 59, 0.3)',
  },
  headerCell: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  firstColCell: {
    paddingLeft: 14,
  },
  headerCellText: {
    color: '#FF6B6B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  evenRow: {
    backgroundColor: 'transparent',
  },
  oddRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  dataCell: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  cellText: {
    fontSize: 12.5,
    color: '#CCC',
    lineHeight: 17,
  },
  firstColText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  highlightBadge: {
    backgroundColor: 'rgba(74, 222, 128, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.25)',
  },
  highlightText: {
    color: '#4ADE80',
    fontSize: 12,
    fontWeight: '700',
  },
});
