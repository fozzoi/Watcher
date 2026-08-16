import React, { useEffect } from 'react';
import { View, StyleSheet, DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

export interface ShimmerBlockProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export const ShimmerBlock: React.FC<ShimmerBlockProps> = ({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}) => {
  const shimmerProgress = useSharedValue(0);

  useEffect(() => {
    shimmerProgress.value = withRepeat(
      withTiming(1, {
        duration: 1300,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1),
      }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(shimmerProgress.value, [0, 1], [-150, 350]);
    return {
      transform: [{ translateX }],
    };
  });

  return (
    <View
      style={[
        styles.container,
        {
          width,
          height,
          borderRadius,
        },
        style,
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <LinearGradient
          colors={[
            'rgba(255, 255, 255, 0)',
            'rgba(255, 255, 255, 0.06)',
            'rgba(255, 255, 255, 0.12)',
            'rgba(255, 255, 255, 0.06)',
            'rgba(255, 255, 255, 0)',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#16161A',
    overflow: 'hidden',
    position: 'relative',
  },
});
