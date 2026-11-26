// src/components/shared/Aurora.tsx
import React, { memo, useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
  type LayoutChangeEvent,
} from 'react-native';
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import {
  useSharedValue,
  useFrameCallback,
  useDerivedValue,
} from 'react-native-reanimated';

const RENDER_SCALE = 0.25;
const TARGET_FRAME_STEP_SEC = 1 / 24; // ~24fps keeps slow aurora drift fluid with 75-80% fewer GPU redraws

/**
 * Aurora SkSL Runtime Effect Shader
 * Adapted from React Bits WebGL (GLSL ES 300) to Skia Shading Language (SkSL).
 * Runs natively on the device GPU at full refresh rate (60/90/120Hz).
 */
const AURORA_SKSL = `
uniform float2 uResolution;
uniform float uTime;
uniform float3 uColor0;
uniform float3 uColor1;
uniform float3 uColor2;
uniform float3 uColor3;
uniform float3 uColor4;
uniform float uStopCount;
uniform float uAmplitude;
uniform float uBlend;
uniform float uHeight;
uniform float uScale;
uniform float uGlow;
uniform float uBrightness;
uniform float uLayers;
uniform float uFlip;
uniform float uOpacity;
uniform float uLightMode;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = vec4(x0.xy, x0.xy) + C.xxzz;
  x12 = vec4(x12.xy - i1, x12.zw);
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(vec3(0.5) - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), vec3(0.0));
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - vec3(1.0);
  vec3 h = abs(x) - vec3(0.5);
  vec3 ox = floor(x + vec3(0.5));
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float smootherstep(float edge0, float edge1, float x) {
  float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0);
  float n = uStopCount - 1.0;
  if (n <= 1.0) {
    return mix(uColor0, uColor1, t);
  }
  float x = t * n;
  if (x < 1.0) {
    float f = x;
    f = f * f * (3.0 - 2.0 * f);
    return mix(uColor0, uColor1, f);
  } else if (x < 2.0) {
    float f = x - 1.0;
    f = f * f * (3.0 - 2.0 * f);
    return mix(uColor1, uColor2, f);
  } else if (x < 3.0) {
    float f = x - 2.0;
    f = f * f * (3.0 - 2.0 * f);
    return mix(uColor2, uColor3, f);
  } else {
    float f = clamp(x - 3.0, 0.0, 1.0);
    f = f * f * (3.0 - 2.0 * f);
    return mix(uColor3, uColor4, f);
  }
}

vec4 main(vec2 frag) {
  float y = mix(frag.y / uResolution.y, 1.0 - frag.y / uResolution.y, uFlip);
  float u = frag.x / uResolution.x;
  float X = (frag.x - uResolution.x * 0.5) / uResolution.y;
  float t = uTime;

  vec3 glow = vec3(0.0);
  float cover = 0.0;

  for (int k = 0; k < 3; k++) {
    if (float(k) >= uLayers) break;
    float layer = float(k);
    float seed = layer * 13.7;
    float pace = t * (1.0 - layer * 0.18);
    float warp = snoise(vec2(X * 0.45 * uScale + pace * 0.02 + seed, pace * 0.05 + seed));
    float wave = snoise(vec2(X * 0.75 * uScale + warp * 0.35 - pace * 0.03 + seed, pace * 0.07 - seed)) * 0.72
      + snoise(vec2(X * 1.6 * uScale + warp * 0.5 + pace * 0.04 - seed, pace * 0.1 + seed * 0.5)) * 0.28;
    float hem = uHeight + layer * 0.07 + wave * 0.15 * uAmplitude;

    float soft = (0.04 + uBlend * 0.16) * (1.0 + layer * 0.9);
    float rise = hem - y;
    float low = -soft - uGlow * 0.14;
    float high = 0.26 + soft * 0.6;
    float body = pow(smootherstep(low, high, rise), 1.5 + uGlow * 0.6);
    float lobes = 0.86 + 0.14 * snoise(vec2(X * 0.9 * uScale - pace * 0.025 + seed, y * 0.3 + pace * 0.04));
    float alpha = body * lobes * (layer < 0.5 ? 1.0 : 0.32 / layer);
    alpha = clamp(alpha, 0.0, 1.0);

    vec3 tint = ramp(u + 0.05 * sin(pace * 0.08 + layer * 2.3) + layer * 0.1 + max(rise, 0.0) * 0.05);
    glow = vec3(1.0) - (vec3(1.0) - glow) * (vec3(1.0) - tint * alpha);
    cover = 1.0 - (1.0 - cover) * (1.0 - alpha);
  }

  float fade = uOpacity;
  float strength = clamp(uBrightness, 0.0, 2.0);
  glow *= fade * min(strength, 1.0);
  cover *= fade * min(strength, 1.0);
  glow = vec3(1.0) - pow(vec3(1.0) - glow, vec3(max(strength, 1.0)));

  if (uLightMode > 0.5) {
    vec3 tint = cover > 0.0001 ? glow / cover : vec3(0.0);
    cover *= smootherstep(0.0, 0.25, cover);
    float alpha = cover * 0.7;
    return vec4(tint * alpha, clamp(alpha, 0.0, 1.0));
  }
  return vec4(glow, clamp(cover, 0.0, 1.0));
}
`;

export interface AuroraProps {
  /** Two to five colors that blend across the aurora from left to right. */
  colorStops?: string[];
  /** How tall the waves along the edge are. Default: 1. */
  amplitude?: number;
  /** How softly the edge fades out, from 0 to 1. Default: 0.5. */
  blend?: number;
  /** Speed of the flowing motion. Default: 1. */
  speed?: number;
  /** Optional custom clock driving the animation, e.g. scroll progress. */
  time?: number;
  /** How far the aurora reaches into the container, from 0 to 1. Default: 0.45. */
  height?: number;
  /** Size of the waves. Lower values make broader shapes. Default: 1. */
  scale?: number;
  /** How far the light spills softly past the edge. Default: 0.6. */
  glow?: number;
  /** Overall brightness of the light. Default: 1. */
  brightness?: number;
  /** Number of curtains, from 1 to 3. Default: 1. */
  layers?: number;
  /** Whether the aurora hangs from the top or rises from the bottom. Default: 'top'. */
  direction?: 'top' | 'bottom';
  /** Opacity of the whole effect, from 0 to 1. Default: 1. */
  opacity?: number;
  /** Draws the aurora as soft pastel light for light backgrounds. Default: false. */
  lightMode?: boolean;
  /** Freezes the animation when true. Default: false. */
  paused?: boolean;
  /** Container style overrides. */
  style?: StyleProp<ViewStyle>;
}

export function hexToRgb01(hex: string): [number, number, number] {
  if (!hex || typeof hex !== 'string') return [0.5, 0.5, 0.5];
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return [isNaN(r) ? 1 : r, isNaN(g) ? 1 : g, isNaN(b) ? 1 : b];
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return [isNaN(r) ? 1 : r, isNaN(g) ? 1 : g, isNaN(b) ? 1 : b];
  }
  return [0.5, 0.5, 0.5];
}

const DEFAULT_STOPS = ['#5227FF', '#7cff67', '#5227FF'];

export const Aurora = memo(function Aurora({
  colorStops = DEFAULT_STOPS,
  amplitude = 1,
  blend = 0.5,
  speed = 1,
  time,
  height = 0.45,
  scale = 1,
  glow = 0.6,
  brightness = 1,
  layers = 1,
  direction = 'top',
  opacity = 1,
  lightMode = false,
  paused = false,
  style,
}: AuroraProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [layout, setLayout] = useState({
    width: screenWidth,
    height: Math.min(600, screenHeight),
  });

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setLayout((prev) =>
        Math.round(prev.width) === Math.round(width) && Math.round(prev.height) === Math.round(height)
          ? prev
          : { width, height }
      );
    }
  }, []);

  // Compile SkSL RuntimeEffect once (memoized)
  const effect = useMemo(() => {
    try {
      return Skia.RuntimeEffect.Make(AURORA_SKSL);
    } catch {
      return null;
    }
  }, []);

  // Downscaled offscreen resolution scaled smoothly back up by GPU bilinear filtering (16x fewer pixels)
  const scaledDims = useMemo(() => {
    const sw = Math.max(1, Math.round(layout.width * RENDER_SCALE));
    const sh = Math.max(1, Math.round(layout.height * RENDER_SCALE));
    return {
      width: sw,
      height: sh,
      resolution: [sw, sh] as [number, number],
      scaleX: layout.width / sw,
      scaleY: layout.height / sh,
      left: (layout.width - sw) / 2,
      top: (layout.height - sh) / 2,
    };
  }, [layout.width, layout.height]);

  // Continuous frame timer running on C++ UI thread, throttled & completely deactivated when paused
  const clock = useSharedValue(0);
  const accumDt = useSharedValue(0);

  const frameCallback = useFrameCallback((frameInfo) => {
    const dt = frameInfo.timeSincePreviousFrame
      ? Math.min(0.05, frameInfo.timeSincePreviousFrame / 1000)
      : 1 / 60;
    accumDt.value += dt;
    if (accumDt.value >= TARGET_FRAME_STEP_SEC) {
      clock.value += accumDt.value * speed;
      accumDt.value = 0;
    }
  }, !paused && time === undefined);

  useEffect(() => {
    frameCallback.setActive(!paused && time === undefined);
  }, [frameCallback, paused, time]);

  // Parse color stops into normalized RGB vectors
  const parsedColors = useMemo(() => {
    const stops = (Array.isArray(colorStops) ? colorStops : [])
      .filter(Boolean)
      .map(String)
      .slice(0, 5);
    const effective =
      stops.length >= 2
        ? stops
        : stops.length === 1
        ? [stops[0], stops[0]]
        : DEFAULT_STOPS;

    const c0 = hexToRgb01(effective[0]);
    const c1 = hexToRgb01(effective[1]);
    const c2 = hexToRgb01(effective[2] || effective[effective.length - 1]);
    const c3 = hexToRgb01(effective[3] || effective[effective.length - 1]);
    const c4 = hexToRgb01(effective[4] || effective[effective.length - 1]);

    return {
      c0,
      c1,
      c2,
      c3,
      c4,
      count: effective.length,
    };
  }, [colorStops]);

  const amp = Math.max(0, amplitude);
  const blnd = Math.max(0, Math.min(1, blend));
  const hgt = Math.max(0, Math.min(1, height));
  const scl = Math.max(0.1, scale);
  const glw = Math.max(0, glow);
  const brt = Math.max(0, brightness);
  const lyrs = Math.max(1, Math.min(3, layers));
  const flp = direction === 'bottom' ? 1.0 : 0.0;
  const opc = Math.max(0, Math.min(1, opacity));
  const lm = lightMode ? 1.0 : 0.0;

  // Reactive SkSL uniforms
  const uniforms = useDerivedValue(() => {
    return {
      uResolution: scaledDims.resolution,
      uTime: time !== undefined ? time * speed * 0.1 : clock.value,
      uColor0: parsedColors.c0,
      uColor1: parsedColors.c1,
      uColor2: parsedColors.c2,
      uColor3: parsedColors.c3,
      uColor4: parsedColors.c4,
      uStopCount: parsedColors.count,
      uAmplitude: amp,
      uBlend: blnd,
      uHeight: hgt,
      uScale: scl,
      uGlow: glw,
      uBrightness: brt,
      uLayers: lyrs,
      uFlip: flp,
      uOpacity: opc,
      uLightMode: lm,
    };
  }, [scaledDims, time, speed, clock, parsedColors, amp, blnd, hgt, scl, glw, brt, lyrs, flp, opc, lm]);

  return (
    <View style={[styles.container, style]} onLayout={onLayout} pointerEvents="none">
      {effect && layout.width > 0 && layout.height > 0 ? (
        <Canvas
          style={{
            position: 'absolute',
            left: scaledDims.left,
            top: scaledDims.top,
            width: scaledDims.width,
            height: scaledDims.height,
            transform: [{ scaleX: scaledDims.scaleX }, { scaleY: scaledDims.scaleY }],
          }}
        >
          <Fill>
            <Shader source={effect} uniforms={uniforms} />
          </Fill>
        </Canvas>
      ) : null}
    </View>
  );
});

export default Aurora;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
});
