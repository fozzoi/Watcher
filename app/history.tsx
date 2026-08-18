import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { ThemedDialog } from "../src/components/shared/ThemedDialog";

interface HistoryItem {
  query: string;
  date: string;
}

const { width } = Dimensions.get("window");
const SWIPE_THRESHOLD = -80;

// Native Date Formatter (Replaces Moment)
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
};

const HistoryPage = () => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const router = useRouter();
  const [currentlyOpenSwipeable, setCurrentlyOpenSwipeable] = useState<number | null>(null);
  const animatedValues = useRef<{[key: string]: Animated.Value}>({}).current;
  const [isAlertVisible, setIsAlertVisible] = useState(false);

  const loadHistory = async () => {
    const jsonValue = await AsyncStorage.getItem("searchHistory");
    if (jsonValue) {
      const parsed = JSON.parse(jsonValue);
      setHistory(parsed.reverse());
    }
  };

  const handleClearHistory = async () => {
    await AsyncStorage.removeItem("searchHistory");
    setHistory([]);
    setIsAlertVisible(false);
  };

  const deleteHistoryItem = async (itemIndex: number) => {
    const updatedHistory = history.filter((_, index) => index !== itemIndex);
    setHistory(updatedHistory);
    await AsyncStorage.setItem("searchHistory", JSON.stringify(updatedHistory));
    if (animatedValues[`item-${itemIndex}`]) {
      animatedValues[`item-${itemIndex}`].setValue(0);
    }
  };

  const groupHistoryByDate = () => {
    const grouped: { Today: HistoryItem[]; Yesterday: HistoryItem[]; Older: HistoryItem[] } = {
      Today: [], Yesterday: [], Older: [],
    };

    const now = new Date();
    const todayStr = now.toDateString();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    history.forEach((item) => {
      const itemDate = new Date(item.date);
      const itemDateStr = itemDate.toDateString();

      if (itemDateStr === todayStr) {
        grouped.Today.push(item);
      } else if (itemDateStr === yesterdayStr) {
        grouped.Yesterday.push(item);
      } else {
        grouped.Older.push(item);
      }
    });

    return grouped;
  };

  useFocusEffect(useCallback(() => { loadHistory(); }, []));

  const getSwipeableItemProps = (itemIndex: number) => {
    if (!animatedValues[`item-${itemIndex}`]) {
      animatedValues[`item-${itemIndex}`] = new Animated.Value(0);
    }
    
    const panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderGrant: () => {
        if (currentlyOpenSwipeable !== null && currentlyOpenSwipeable !== itemIndex) {
          Animated.spring(animatedValues[`item-${currentlyOpenSwipeable}`], {
            toValue: 0, useNativeDriver: false,
          }).start();
        }
        setCurrentlyOpenSwipeable(itemIndex);
      },
      onPanResponderMove: (_, gesture) => {
        animatedValues[`item-${itemIndex}`].setValue(Math.max(gesture.dx, -100));
      },
      onPanResponderRelease: (_, gesture) => {
        const toValue = gesture.dx < SWIPE_THRESHOLD ? -100 : 0;
        Animated.spring(animatedValues[`item-${itemIndex}`], {
          toValue, useNativeDriver: false,
        }).start();
        if (toValue === 0) setCurrentlyOpenSwipeable(null);
      },
    });
    
    return { panHandlers: panResponder.panHandlers, animatedStyle: { transform: [{ translateX: animatedValues[`item-${itemIndex}`] }] } };
  };

  const groupedHistory = groupHistoryByDate();

  const renderHistoryItem = (item: HistoryItem, index: number, groupOffset: number, isLast: boolean = false) => {
    const itemIndex = groupOffset + index;
    const { animatedStyle, panHandlers } = getSwipeableItemProps(itemIndex);
    
    return (
      <View key={itemIndex} style={[styles.swipeContainer, !isLast && { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }]}>
        <Animated.View style={[styles.historyItemContainer, animatedStyle]} {...panHandlers}>
          <TouchableOpacity activeOpacity={0.95}
            style={styles.historyItem}
            onPress={() => router.push(`/search?prefillQuery=${encodeURIComponent(item.query)}`)}
          >
            <Text style={styles.queryText} numberOfLines={1}>{item.query}</Text>
            <Text style={styles.dateText}>{formatDate(item.date)}</Text>
          </TouchableOpacity>
        </Animated.View>
        <TouchableOpacity activeOpacity={0.95} style={styles.deleteButton} onPress={() => deleteHistoryItem(itemIndex)}>
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* --- Themed Clear History Dialog --- */}
      <ThemedDialog
        visible={isAlertVisible}
        title="Clear History"
        message="Are you sure you want to delete all search history? This cannot be undone."
        type="danger"
        buttons={[
          { text: 'Cancel', style: 'cancel', onPress: () => setIsAlertVisible(false) },
          { text: 'Clear All', style: 'destructive', onPress: handleClearHistory }
        ]}
        onClose={() => setIsAlertVisible(false)}
      />

      <View style={styles.header}>
        <Text style={styles.title}>Search History</Text>
        <TouchableOpacity activeOpacity={0.95} onPress={() => setIsAlertVisible(true)} style={styles.clearButtonContainer}>
          <Text style={styles.clearButton}>Clear</Text>
        </TouchableOpacity>
      </View>

      {Object.entries(groupedHistory).map(([group, items], groupIndex) =>
        items.length > 0 ? (
          <View key={group} style={styles.groupContainer}>
            <Text style={styles.groupTitle}>{group}</Text>
            <View style={styles.itemsContainer}>
              {items.map((item, index) => {
                let groupOffset = 0;
                for (let i = 0; i < groupIndex; i++) {
                  groupOffset += Object.values(groupedHistory)[i].length;
                }
                return renderHistoryItem(item, index, groupOffset, index === items.length - 1);
              })}
            </View>
          </View>
        ) : null
      )}

      {history.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No search history yet.</Text>
        </View>
      )}
    </ScrollView>
  );
};


export default HistoryPage;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212", 
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  title: {
    color: "#FFF",
    fontSize: 26,
    fontFamily: "GoogleSansFlex-Bold",
    letterSpacing: -0.5,
  },
  clearButtonContainer: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  clearButton: {
    color: "#FFF", 
    fontSize: 13,
    fontFamily: 'GoogleSansFlex-Medium',
  },
  groupContainer: {
    marginBottom: 28,
  },
  groupTitle: {
    color: "#888",
    fontSize: 13,
    fontFamily: 'GoogleSansFlex-Bold',
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  itemsContainer: {
    borderRadius: 16,
    backgroundColor: '#1C1C1E',
    overflow: "hidden",
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  swipeContainer: {
    position: "relative",
    height: 72, 
    overflow: "hidden",
  },
  historyItemContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1,
  },
  historyItem: {
    backgroundColor: "#1C1C1E", 
    paddingHorizontal: 20,
    height: "100%",
    justifyContent: "center",
  },
  queryText: {
    color: "#FFF",
    fontSize: 16,
    fontFamily: 'GoogleSansFlex-Medium',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  dateText: {
    color: "#777",
    fontSize: 12,
    fontFamily: 'GoogleSansFlex-Medium',
  },
  deleteButton: {
    position: "absolute",
    backgroundColor: "#E50914",
    right: 0,
    top: 0,
    bottom: 0,
    width: 85,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButtonText: {
    color: "white",
    fontFamily: 'GoogleSansFlex-Bold',
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 100,
  },
  emptyText: {
    color: "#FFF",
    textAlign: "center",
    fontSize: 18,
    fontFamily: 'GoogleSansFlex-Bold',
  },
  emptySubText: {
    color: "#777",
    textAlign: "center",
    marginTop: 8,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex-Regular',
  },
  // We keep modal styles around for ThemedDialog if it uses them, but ThemedDialog handles itself.
});