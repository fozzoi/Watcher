import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Dimensions, View, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';


const DOCK_MARGIN_BOTTOM = Platform.OS === 'ios' ? 25 : 25;
const TAB_BAR_HEIGHT = 68;
const SCREEN_WIDTH = Dimensions.get('window').width;

const CustomTabBar = ({ state, descriptors, navigation }: any) => {
    const currentRoute = state.routes[state.index];
    if (currentRoute?.name === 'aichat') {
        return null;
    }

    return (
        <View style={localStyles.overlayContainer} pointerEvents="box-none">
            <LinearGradient
                colors={['transparent', 'rgba(10,10,10,0.8)', 'rgba(10,10,10,1)']}
                style={localStyles.bottomGradient}
                pointerEvents="none"
            />
            <View style={localStyles.pillContainer}>
                <View style={localStyles.tabBarInner}>
                    {state.routes.map((route, index) => {
                        const { options } = descriptors[route.key];
                        const isFocused = state.index === index;

                        const onPress = () => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            const event = navigation.emit({
                                type: 'tabPress',
                                target: route.key,
                                canPreventDefault: true,
                            });

                            if (!isFocused && !event.defaultPrevented) {
                                navigation.navigate(route.name);
                            }
                        };

                        const iconComponent = options.tabBarIcon
                            ? options.tabBarIcon({
                                focused: isFocused,
                                color: isFocused ? '#E50914' : 'rgba(255,255,255,0.6)',
                                size: 26
                            })
                            : null;

                        return (
                            <TouchableOpacity
                                key={route.key}
                                accessibilityRole="button"
                                accessibilityState={isFocused ? { selected: true } : {}}
                                onPress={onPress}
                                style={localStyles.tabButton}
                                activeOpacity={0.95}
                            >
                                {iconComponent}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        </View>
    );
};

const localStyles = StyleSheet.create({
    overlayContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    bottomGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 120,
    },
    pillContainer: {
        width: Math.min(SCREEN_WIDTH - 100, 260),
        height: TAB_BAR_HEIGHT,
        marginBottom: DOCK_MARGIN_BOTTOM,
        borderRadius: 27,
        overflow: 'hidden',
        borderColor: 'rgb(22, 22, 22)',
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 8,
        elevation: 10,
        backgroundColor: 'rgb(10, 10, 10)',
    },
    tabBarInner: {
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        justifyContent: 'space-evenly',
        alignItems: 'center',
    },
    tabButton: {
        flex: 1,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default function TabLayout() {
    return (
        <Tabs
            backBehavior="history"
            tabBar={(props) => <CustomTabBar {...props} />}
            screenOptions={{
                headerShown: false,
                tabBarShowLabel: false,
                tabBarHideOnKeyboard: false,
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Explore',
                    tabBarIcon: ({ color, size, focused }) => (
                        <Ionicons name={focused ? "compass" : "compass-outline"} size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="watchlist"
                options={{
                    title: 'Watchlist',
                    tabBarIcon: ({ color, size, focused }) => (
                        <Ionicons name={focused ? "bookmark" : "bookmark-outline"} size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="search"
                options={{
                    title: 'Search',
                    tabBarIcon: ({ color, size, focused }) => (
                        <Ionicons name={focused ? "search" : "search-outline"} size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="aichat"
                options={{
                    title: 'AI Chat',
                    tabBarIcon: ({ color, size, focused }) => (
                        <View style={{
                            width: size + 16, height: size + 16, borderRadius: (size + 16) / 2,
                            backgroundColor: focused ? "rgba(139, 92, 246, 0.2)" : "rgba(255, 255, 255, 0.05)",
                            justifyContent: "center", alignItems: "center",
                            borderWidth: 1, borderColor: focused ? "rgba(139, 92, 246, 0.5)" : "transparent",
                            shadowColor: "#8B5CF6", shadowOffset: { width: 0, height: 0 }, shadowOpacity: focused ? 0.8 : 0, shadowRadius: 10
                        }}>
                            <Ionicons name={focused ? "sparkles" : "sparkles-outline"} size={size - 2} color={focused ? "#A78BFA" : "rgba(255,255,255,0.6)"} />
                        </View>
                    ),
                }}
            />
        </Tabs>
    );
}
