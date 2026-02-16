import React, { memo, useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  withRepeat,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

const AtmosphericBackground = memo(() => {
  const rotate1 = useSharedValue(0);
  const rotate2 = useSharedValue(45);

  useEffect(() => {
    rotate1.value = withRepeat(withTiming(360, { duration: 35000, easing: Easing.linear }), -1);
    rotate2.value = withRepeat(withTiming(405, { duration: 40000, easing: Easing.linear }), -1);
  }, []);

  const animatedStyle1 = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotate1.value}deg` }] }));
  const animatedStyle2 = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotate2.value}deg` }] }));

  return (
    <View style={styles.atmosContainer} pointerEvents="none">
      <Animated.View style={[styles.atmosGradientWrapper, animatedStyle1]}>
        <LinearGradient colors={['rgba(229, 9, 20, 0.2)', 'rgba(10, 20, 178, 0)']} style={styles.atmosGradient} />
      </Animated.View>
      <Animated.View style={[styles.atmosGradientWrapper, animatedStyle2]}>
        <LinearGradient colors={['rgba(22, 178, 10, 0.2)', 'rgba(178, 10, 166, 0)']} style={styles.atmosGradient} />
      </Animated.View>
    </View>
  );
});

export default AtmosphericBackground;

const styles = StyleSheet.create({
  atmosContainer: { ...StyleSheet.absoluteFillObject, zIndex: -1, backgroundColor: '#141414', overflow: 'hidden' },
  atmosGradientWrapper: { position: 'absolute', width: width * 1.5, height: width * 1.5, left: -width / 4, top: -width / 4 },
  atmosGradient: { width: '100%', height: '100%', opacity: 0.25 },
});