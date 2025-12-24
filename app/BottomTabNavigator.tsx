// BottomTabNavigator.tsx
import React from 'react';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Dimensions, View, StyleSheet, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

// Import your existing tab screens
import History from '../app/history';
import Explore from './Explore';
import Index from '../app/index';
import WatchListPage from '../app/WatchListPage';
import SettingsPage from '../app/Settings'; // <--- IMPORTED SETTINGS

// Import your detail screens
import DetailPage from './DetailPage';
import CastDetails from './CastDetails';
import ViewAllPage from './ViewAllPage';
// import ListDetails from './ListDetails';
import SimilarMoviesPage from './SimilarMoviesPage';


const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// --- CONFIGURATION ---
const DOCK_MARGIN_BOTTOM = Platform.OS === 'ios' ? 30 : 20;
const TAB_BAR_HEIGHT = 70; 
const SCREEN_WIDTH = Dimensions.get('window').width;

// --- STACK OPTIONS ---
const stackScreenOptions = {
    headerShown: false,
    cardStyle: { backgroundColor: '#000' },
    animation: 'slide_from_right',
    fullScreenGestureEnabled: true,
    keyboardHandlingEnabled: true,
    presentation: 'card',
    animationEnabled: true,
    gestureDirection: 'horizontal',
    contentStyle: { backgroundColor: '#000' },
    freezeOnBlur: true,
    detachPreviousScreen: false,
    cardOverlayEnabled: true,
    cardStyleInterpolator: ({ current, layouts }: any) => {
        const width = layouts?.screen?.width ?? SCREEN_WIDTH;
        const progress = current.progress;

        const translateX = progress.interpolate({
            inputRange: [0, 1],
            outputRange: [width * 0.25, 0], 
        });

        const opacity = progress.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0, 0.6, 1],
        });

        return {
            cardStyle: {
                transform: [{ translateX }],
                opacity,
            },
            overlayStyle: {
                backgroundColor: '#000000ff',
                opacity: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 0.5],
                }),
            },
        };
    },
};

// --- STACK NAVIGATORS ---
const SearchStack = () => (
    <Stack.Navigator screenOptions={stackScreenOptions}>
        <Stack.Screen name="SearchMain" component={Index} />
        <Stack.Screen name="Detail" component={DetailPage} />
        <Stack.Screen name="CastDetails" component={CastDetails} />
        <Stack.Screen name="ViewAll" component={ViewAllPage} />
        {/* <Stack.Screen name="ListDetails" component={ListDetails} /> */}
        <Stack.Screen name="SimilarMovies" component={SimilarMoviesPage} />
        <Stack.Screen name="history" component={History} />
    </Stack.Navigator>
);

const WatchlistStack = () => (
    <Stack.Navigator screenOptions={stackScreenOptions}>
        <Stack.Screen name="WatchlistMain" component={WatchListPage} />
        <Stack.Screen name="Detail" component={DetailPage} />
        <Stack.Screen name="CastDetails" component={CastDetails} />
        <Stack.Screen name="ViewAll" component={ViewAllPage} />
        {/* <Stack.Screen name="ListDetails" component={ListDetails} /> */}
        <Stack.Screen name="SimilarMovies" component={SimilarMoviesPage} />
        <Stack.Screen name="history" component={History} />
    </Stack.Navigator>
);

const ExploreStack = () => (
    <Stack.Navigator screenOptions={stackScreenOptions}>
        <Stack.Screen name="ExploreMain" component={Explore} />
        <Stack.Screen name="Detail" component={DetailPage} />
        <Stack.Screen name="CastDetails" component={CastDetails} />
        <Stack.Screen name="ViewAll" component={ViewAllPage} />
        {/* <Stack.Screen name="ListDetails" component={ListDetails} /> */}
        <Stack.Screen name="SimilarMovies" component={SimilarMoviesPage} />
        <Stack.Screen name="history" component={History} />
        <Stack.Screen name="Settings" component={SettingsStack} />
        <Stack.Screen name="AiSearch" component={require('../app/AiSearch').default} />
    </Stack.Navigator>
);

// ✅ NEW SETTINGS STACK
const SettingsStack = () => (
    <Stack.Navigator screenOptions={stackScreenOptions}>
        <Stack.Screen name="SettingsMain" component={SettingsPage} />
        <Stack.Screen name="Detail" component={DetailPage} />
        <Stack.Screen name="CastDetails" component={CastDetails} />
        <Stack.Screen name="history" component={History} />
    </Stack.Navigator>
);

// --- 2. CUSTOM TAB BAR ---
const CustomTabBar: React.FC<BottomTabBarProps> = (props) => {
  const { state, navigation, descriptors } = props;

  return (
    <View style={localStyles.overlayContainer} pointerEvents="box-none">
        
        {/* THE SPOTIFY GRADIENT FADE */}
        <LinearGradient
            colors={['transparent', 'rgba(0, 0, 0, 0.23)', 'rgba(0, 0, 0, 0.56)', '#000000f8']}
            locations={[0, 0.3, 0.7, 1]}
            style={localStyles.bottomGradient}
            pointerEvents="none" 
        />

        {/* THE PILL TAB BAR */}
        <View style={localStyles.pillContainer}>
            {/* Blur Background of Pill */}
            {/* <BlurView 
              intensity={25}
              tint='dark'
              experimentalBlurMethod="dimezisBlurView"
              style={StyleSheet.absoluteFillObject}
            /> */}
            
            {/* Icons Container */}
            <View style={localStyles.tabBarInner}>
                {state.routes.map((route, index) => {
                    const { options } = descriptors[route.key];
                    const isFocused = state.index === index;

                    const onPress = () => {
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
                            activeOpacity={0.7}
                        >
                            {iconComponent}
                            {/* Optional Active Dot Indicator */}
                            {isFocused && <View style={localStyles.activeDot} />}
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    </View>
  );
};

// --- 3. STYLES ---
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
        height: 140, // Height of the fade effect
    },
    pillContainer: {
        width: Math.min(SCREEN_WIDTH - 60, 350), // Responsive width
        height: TAB_BAR_HEIGHT,
        marginBottom: DOCK_MARGIN_BOTTOM,
        borderRadius: 35, // Fully rounded ends
        overflow: 'hidden',
        // Glassmorphism Border
        borderColor: 'rgba(255, 255, 255, 0.15)',
        borderWidth: 1,
        // Shadow for depth
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.04)', // Slight dark tint base
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
    activeDot: {
        position: 'absolute',
        bottom: 12, // Adjusted position for pill height
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#E50914',
    }
});

// --- 4. ROOT COMPONENT ---
const RootTabNavigator = () => {
    return (
            <Tab.Navigator
                tabBar={props => <CustomTabBar {...props} />}
                screenOptions={({ route }) => ({
                    tabBarIcon: ({ color, size, focused }) => {
                        let iconName: keyof typeof Ionicons.glyphMap = 'search';

                        if (route.name === 'Search') {
                            iconName = focused ? 'search' : 'search-outline';
                        } else if (route.name === 'Watchlist') {
                            iconName = focused ? 'bookmark' : 'bookmark-outline';
                        } else if (route.name === 'Explore') {
                            iconName = focused ? 'compass' : 'compass-outline';
                        }
                        return <Ionicons name={iconName} size={size} color={color} />;
                    },
                    headerShown: false,
                    tabBarShowLabel: false, 
                    tabBarHideOnKeyboard: false,
                })}>
                <Tab.Screen name="Explore" component={ExploreStack} />
                <Tab.Screen name="Watchlist" component={WatchlistStack} />
                <Tab.Screen name="Search" component={SearchStack} />
        
            </Tab.Navigator>
    );
};

export default RootTabNavigator;