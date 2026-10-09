import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Dimensions, View, StyleSheet, TouchableOpacity, DeviceEventEmitter, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { BlurView, BlurTargetView } from 'expo-blur';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DOCK_MARGIN_BOTTOM = Platform.OS === 'ios' ? 40 : 35;
const TAB_BAR_HEIGHT = Math.min(68, Math.max(60, SCREEN_HEIGHT * 0.075));
const TAB_BAR_WIDTH = Math.min(SCREEN_WIDTH - 60, 260);

const TABS = [
    {
        name: 'index',
        path: '/',
        icon: (focused: boolean, color: string, size: number) => (
            <Ionicons name={focused ? 'compass' : 'compass-outline'} size={size} color={color} />
        ),
    },
    {
        name: 'watchlist',
        path: '/watchlist',
        icon: (focused: boolean, color: string, size: number) => (
            <Ionicons name={focused ? 'bookmark' : 'bookmark-outline'} size={size} color={color} />
        ),
    },
    {
        name: 'search',
        path: '/search',
        icon: (focused: boolean, color: string, size: number) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={size} color={color} />
        ),
    },
    {
        name: 'aichat',
        path: '/aichat',
        icon: (focused: boolean, color: string, size: number) => (
            <View
                style={{
                    width: size + 16,
                    height: size + 16,
                    borderRadius: (size + 16) / 2,
                    backgroundColor: focused ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: focused ? 'rgba(139, 92, 246, 0.5)' : 'transparent',
                    shadowColor: '#8B5CF6',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: focused ? 0.8 : 0,
                    shadowRadius: 10,
                }}
            >
                <Ionicons
                    name={focused ? 'sparkles' : 'sparkles-outline'}
                    size={size - 2}
                    color={focused ? '#A78BFA' : 'rgba(255,255,255,0.6)'}
                />
            </View>
        ),
    },
];

const CustomTabBar = ({ targetRef, targetReady }: { targetRef: any; targetReady: boolean }) => {
    const pathname = usePathname();
    const router = useRouter();

    const scaleAnim = useRef(new Animated.Value(1)).current;
    const translateYAnim = useRef(new Animated.Value(0)).current;
    const lastScrollY = useRef(0);
    const isShrunk = useRef(false);
    const [blurEnabled, setBlurEnabled] = useState(false);

    useEffect(() => {
        if (targetReady || targetRef?.current) {
            setBlurEnabled(true);
        }
    }, [targetReady, targetRef]);

    useEffect(() => {
        const sub = DeviceEventEmitter.addListener('exploreScroll', (offsetY) => {
            const diff = offsetY - lastScrollY.current;

            if (Math.abs(diff) > 200) {
                lastScrollY.current = offsetY;
                if (offsetY <= 50 && isShrunk.current) {
                    isShrunk.current = false;
                    Animated.parallel([
                        Animated.timing(scaleAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
                        Animated.timing(translateYAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
                    ]).start();
                }
                return;
            }

            if (offsetY > lastScrollY.current && offsetY > 50) {
                if (!isShrunk.current) {
                    isShrunk.current = true;
                    Animated.parallel([
                        Animated.timing(scaleAnim, { toValue: 0.8, duration: 150, useNativeDriver: true }),
                        Animated.timing(translateYAnim, { toValue: TAB_BAR_HEIGHT * 0.1, duration: 150, useNativeDriver: true }),
                    ]).start();
                }
            } else if (offsetY < lastScrollY.current || offsetY <= 50) {
                if (isShrunk.current) {
                    isShrunk.current = false;
                    Animated.parallel([
                        Animated.timing(scaleAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
                        Animated.timing(translateYAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
                    ]).start();
                }
            }
            lastScrollY.current = offsetY;
        });
        return () => sub.remove();
    }, [scaleAnim, translateYAnim]);

    // Hide dock when user is on aichat
    if (pathname === '/aichat') {
        return null;
    }

    return (
        <View style={localStyles.overlayContainer} pointerEvents="box-none">
            <LinearGradient
                colors={['transparent', 'rgba(10,10,10,0.3)', 'rgba(10,10,10,0.75)']}
                style={localStyles.bottomGradient}
                pointerEvents="none"
            />
            <Animated.View
                style={[
                    localStyles.pillContainer,
                    { transform: [{ scale: scaleAnim }, { translateY: translateYAnim }] },
                ]}
            >
                {blurEnabled && (
                    <BlurView
                        key="tab-bar-blur"
                        intensity={40}
                        tint="dark"
                        style={StyleSheet.absoluteFill}
                        blurTarget={targetRef}
                        blurMethod="dimezisBlurView"
                    />
                )}
                <View
                    style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(28, 28, 30, 0.45)' }]}
                    pointerEvents="none"
                />
                <View style={localStyles.tabBarInner}>
                    {TABS.map((tab) => {
                        const isFocused =
                            tab.path === '/'
                                ? pathname === '/' || pathname === '/index'
                                : pathname.startsWith(tab.path);

                        const onPress = () => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (!isFocused) {
                                router.navigate(tab.path as any);
                            }
                        };

                        const iconColor = isFocused ? '#E50914' : 'rgba(255,255,255,0.6)';

                        return (
                            <TouchableOpacity
                                key={tab.name}
                                accessibilityRole="button"
                                accessibilityState={isFocused ? { selected: true } : {}}
                                onPress={onPress}
                                style={localStyles.tabButton}
                                activeOpacity={0.95}
                            >
                                {tab.icon(isFocused, iconColor, 26)}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </Animated.View>
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
        height: 50,
    },
    pillContainer: {
        width: TAB_BAR_WIDTH,
        height: TAB_BAR_HEIGHT,
        marginBottom: DOCK_MARGIN_BOTTOM,
        borderRadius: TAB_BAR_HEIGHT / 2,
        overflow: 'hidden',
        borderColor: 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 8,
        elevation: 10,
        backgroundColor: 'transparent',
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
    const targetRef = useRef<View | null>(null);
    const [targetReady, setTargetReady] = useState(false);

    const onTargetRef = useCallback((node: View | null) => {
        targetRef.current = node;
        if (node) {
            setTargetReady(true);
        }
    }, []);

    return (
        <View style={{ flex: 1, backgroundColor: '#141414' }}>
            {/* Target captures only the screens */}
            <BlurTargetView ref={onTargetRef} style={{ flex: 1 }} collapsable={false}>
                <Tabs
                    backBehavior="history"
                    screenOptions={{
                        headerShown: false,
                        tabBarShowLabel: false,
                        tabBarStyle: { display: 'none' }, // Hides default tab bar completely
                    }}
                >
                    <Tabs.Screen name="index" />
                    <Tabs.Screen name="watchlist" />
                    <Tabs.Screen name="search" />
                    <Tabs.Screen name="aichat" />
                </Tabs>
            </BlurTargetView>

            {/* Sibling: Completely outside BlurTargetView to prevent native Dimezis recursion */}
            <CustomTabBar targetRef={targetRef} targetReady={targetReady} />
        </View>
    );
}