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
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router"; // Use expo-router instead of @react-navigation

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
  const router = useRouter(); // Expo Router hook
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

  const renderHistoryItem = (item: HistoryItem, index: number, groupOffset: number) => {
    const itemIndex = index + groupOffset;
    const { animatedStyle, panHandlers } = getSwipeableItemProps(itemIndex);
    
    return (
      <View key={index} style={styles.swipeContainer}>
        <Animated.View style={[styles.historyItemContainer, animatedStyle]} {...panHandlers}>
          <TouchableOpacity
            style={styles.historyItem}
            // Expo Router navigation
            // onPress={() => router.push({ pathname: "/search", params: { prefillQuery: item.query } })}
          >
            <Text style={styles.queryText} numberOfLines={1}>{item.query}</Text>
            <Text style={styles.dateText}>{formatDate(item.date)}</Text>
          </TouchableOpacity>
        </Animated.View>
        <TouchableOpacity style={styles.deleteButton} onPress={() => deleteHistoryItem(itemIndex)}>
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* --- Alert Modal --- */}
      <Modal animationType="fade" transparent visible={isAlertVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Clear History</Text>
            <Text style={styles.modalMessage}>Clear all search history?</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setIsAlertVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonDanger]} onPress={handleClearHistory}>
                <Text style={[styles.modalButtonText, { fontWeight: 'bold' }]}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <Text style={styles.title}>Search History</Text>
        <TouchableOpacity onPress={() => setIsAlertVisible(true)} style={styles.clearButtonContainer}>
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
                return renderHistoryItem(item, index, groupOffset);
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
    backgroundColor: "#141414", // Netflix background color
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
    marginTop: 20,
  },
  title: {
    color: "white",
    fontSize: 28,
    fontWeight: "bold",
    fontFamily: "GoogleSansFlex-Bold",
    letterSpacing: 0.3,
  },
  clearButtonContainer: {
    backgroundColor: "rgba(255, 55, 55, 0.1)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  clearButton: {
    color: "#E50914", // Netflix red
    fontWeight: "600",
    fontFamily: 'GoogleSansFlex-Medium',
  },
  groupContainer: {
    marginBottom: 28,
  },
  groupTitle: {
    color: "#E5E5E5", // Light gray
    fontSize: 20,
    fontWeight: "600",
    fontFamily: 'GoogleSansFlex-Medium',
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  itemsContainer: {
    borderRadius: 8,
    overflow: "hidden",
  },
  swipeContainer: {
    position: "relative",
    marginBottom: 2,
    height: 64, // Fixed height for swipe items
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
    backgroundColor: "#2a2a2a",
    padding: 16,
    height: "100%",
    justifyContent: "center",
    borderRadius: 4,
  },
  queryText: {
    color: "white",
    fontSize: 16,
    fontWeight: "500",
    fontFamily: 'GoogleSansFlex-Medium',
    marginBottom: 4,
  },
  dateText: {
    color: "#B3B3B3", // Netflix light gray text
    fontSize: 12,
    fontFamily: 'GoogleSansFlex-Regular',
  },
  deleteButton: {
    position: "absolute",
    backgroundColor: "#E50914", // Netflix red
    right: 0,
    top: 0,
    bottom: 0,
    width: 100,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 5,
  },
  deleteButtonText: {
    color: "white",
    fontWeight: "600",
    fontFamily: 'GoogleSansFlex-Medium',
    fontSize: 16,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 100,
  },
  emptyText: {
    color: "#E5E5E5",
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    fontFamily: 'GoogleSansFlex-Bold',
  },
  emptySubText: {
    color: "#999999",
    textAlign: "center",
    marginTop: 8,
    fontSize: 14,
    fontFamily: 'GoogleSansFlex-Regular',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#141414',
    borderRadius: 8,
    padding: 20,
    width: '80%',
    alignItems: 'center',
  },
  modalTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'GoogleSansFlex-Bold',
    marginBottom: 10,
  },
  modalMessage: {
    color: '#B3B3B3',
    fontSize: 16,
    fontFamily: 'GoogleSansFlex-Regular',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    padding: 10,
    flex: 1,
    marginHorizontal: 5,
  },
  modalButtonText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 16,
    fontFamily: 'GoogleSansFlex-Regular',
  },
  modalButtonDanger: {
    backgroundColor: '#E50914',
    borderRadius: 4,
  },
  modalButtonTextDanger: {
    fontWeight: 'bold',
  },
});