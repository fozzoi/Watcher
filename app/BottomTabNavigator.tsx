import React from 'react';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Dimensions, View, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

// Import your existing tab screens
import History from './history';
import Explore from './Explore';
import Index from './index';
import WatchListPage from './WatchListPage';
import SettingsPage from './Settings'; 

// Import your detail screens
import DetailPage from './DetailPage';
import CastDetails from './CastDetails';
import ViewAllPage from './ViewAllPage';
import SimilarMoviesPage from './SimilarMoviesPage';
import DownloadManagerScreen from './screens/DownloadManagerScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const DOCK_MARGIN_BOTTOM = Platform.OS === 'ios' ? 25 : 25;
const TAB_BAR_HEIGHT = 68;
const SCREEN_WIDTH = Dimensions.get('window').width;

const stackScreenOptions = {
    headerShown: false,
    cardStyle: { backgroundColor: '#141414' },
    fullScreenGestureEnabled: true,
    keyboardHandlingEnabled: true,
    presentation: 'card' as const,
    contentStyle: { backgroundColor: '#141414' },
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
                backgroundColor: '#141414ff',
                opacity: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 0.5],
                }),
            },
        };
    },
};

const SearchStack = () => (
    <Stack.Navigator screenOptions={stackScreenOptions}>
        <Stack.Screen name="SearchMain" component={Index} />
        <Stack.Screen name="Detail" component={DetailPage} />
        <Stack.Screen name="CastDetails" component={CastDetails} />
        <Stack.Screen name="ViewAll" component={ViewAllPage} />
        <Stack.Screen name="SimilarMovies" component={SimilarMoviesPage} />
        <Stack.Screen name="history" component={History} />
        <Stack.Screen name="DownloadManager" component={DownloadManagerScreen} />
    </Stack.Navigator>
);

const WatchlistStack = () => (
    <Stack.Navigator screenOptions={stackScreenOptions}>
        <Stack.Screen name="WatchlistMain" component={WatchListPage} />
        <Stack.Screen name="Detail" component={DetailPage} />
        <Stack.Screen name="CastDetails" component={CastDetails} />
        <Stack.Screen name="ViewAll" component={ViewAllPage} />
        <Stack.Screen name="SimilarMovies" component={SimilarMoviesPage} />
        <Stack.Screen name="history" component={History} />
        <Stack.Screen name="DownloadManager" component={DownloadManagerScreen} />
    </Stack.Navigator>
);

const ExploreStack = () => (
    <Stack.Navigator screenOptions={stackScreenOptions}>
        <Stack.Screen name="ExploreMain" component={Explore} />
        <Stack.Screen name="Detail" component={DetailPage} />
        <Stack.Screen name="CastDetails" component={CastDetails} />
        <Stack.Screen name="ViewAll" component={ViewAllPage} />
        <Stack.Screen name="SimilarMovies" component={SimilarMoviesPage} />
        <Stack.Screen name="history" component={History} />
        <Stack.Screen name="Settings" component={SettingsStack} />
        <Stack.Screen name="AiSearch" component={require('../app/AiChat').default} />
        <Stack.Screen name="DownloadManager" component={DownloadManagerScreen} />
    </Stack.Navigator>
);

const SettingsStack = () => (
    <Stack.Navigator screenOptions={stackScreenOptions}>
        <Stack.Screen name="SettingsMain" component={SettingsPage} />
        <Stack.Screen name="Detail" component={DetailPage} />
        <Stack.Screen name="CastDetails" component={CastDetails} />
        <Stack.Screen name="history" component={History} />
        
    </Stack.Navigator>
);

const CustomTabBar: React.FC<BottomTabBarProps> = (props) => {
  const { state, navigation, descriptors } = props;

  return (
    <View style={localStyles.overlayContainer} pointerEvents="box-none">
        <LinearGradient
            colors={['transparent', 'rgba(0, 0, 0, 0.23)', 'rgba(0, 0, 0, 0.56)', '#000000f8']}
            locations={[0, 0.3, 0.7, 1]}
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
                            activeOpacity={0.7}
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

const RootTabNavigator = () => {
    return (
        <Tab.Navigator
            backBehavior="history" // 🎯 Add this single line right here!
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
                    } else if (route.name === 'DownloadManager') {
                        iconName = focused ? 'download' : 'download-outline';
                    }   
                    return <Ionicons name={iconName} size={size} color={color} />;
                },
                headerShown: false,
                tabBarShowLabel: false, 
                tabBarHideOnKeyboard: false,
            })}>
            <Tab.Screen name="Explore" component={ExploreStack} />
            <Tab.Screen name="Watchlist" component={WatchlistStack} />
            <Tab.Screen name="DownloadManager" component={DownloadManagerScreen}/>
            <Tab.Screen name="Search" component={SearchStack} />
            
        </Tab.Navigator>
    );
};

export default RootTabNavigator;