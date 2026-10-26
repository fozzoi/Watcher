import { useEffect, useState } from 'react';
import { Skia, ColorType, AlphaType } from '@shopify/react-native-skia';
import { getImageUrl } from '../tmdb';
import { getActiveAmbientTheming } from '../theme/ThemeContext';

export interface ExtractedPalette {
  dominant: string;
  pastelDark: string;
  gradient: [string, string, string];
}

/**
 * Neutral dark backdrop used while the ambient palette is still extracting.
 * It sits between the default background and a typical extracted pastelDark, so
 * the screen only shifts a few points of luminance instead of flashing the
 * default theme first and then jumping to the ambient tint.
 */
export const AMBIENT_PENDING_BG = '#1B1A1F';

// In-memory cache to make re-renders and repeat visits instantaneous
const paletteCache = new Map<string, ExtractedPalette>();

// Extractions currently running. A press-time warm and the details screen hook
// therefore share ONE image download instead of racing two of them.
const inFlight = new Map<string, Promise<ExtractedPalette | null>>();

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  const toHex = (val: number) => Math.round((val + m) * 255).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

/**
 * Extracts the vibrant dominant color and produces an Apple Music-style ambient palette.
 * Deduped by URL: concurrent callers share a single download/decode.
 */
export function extractPaletteFromUrl(imageUrl: string): Promise<ExtractedPalette | null> {
  if (!imageUrl) return Promise.resolve(null);

  const cached = paletteCache.get(imageUrl);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(imageUrl);
  if (pending) return pending;

  const task = decodeAndExtract(imageUrl).finally(() => {
    inFlight.delete(imageUrl);
  });
  inFlight.set(imageUrl, task);
  return task;
}

/**
 * Fire-and-forget prefetch. Call it the moment a card is tapped (before the
 * navigation request is even sent) so the palette is usually cached by the time
 * the details screen mounts — that removes the default-color → ambient-color flash.
 * Safe to call repeatedly; the cache and the in-flight map dedupe the work.
 */
export function warmPalette(imageUrl?: string | null): void {
  if (!imageUrl) return;
  // Ambient theming off means the palette would never be rendered — skip the download.
  if (!getActiveAmbientTheming()) return;
  extractPaletteFromUrl(imageUrl).catch(() => {});
}

/**
 * Prefetch helper for navigation sites. Mirrors the exact URL choice the details
 * screens make (poster w185 → backdrop w300 → profile w185) so the warmed cache
 * key matches the one the details screen will ask for.
 */
export function warmPaletteForMedia(
  item?: {
    poster_path?: string | null;
    backdrop_path?: string | null;
    profile_path?: string | null;
  } | null
): void {
  if (!item) return;

  if (item.poster_path) {
    warmPalette(getImageUrl(item.poster_path, 'w185'));
  } else if (item.backdrop_path) {
    warmPalette(getImageUrl(item.backdrop_path, 'w300'));
  } else if (item.profile_path) {
    warmPalette(getImageUrl(item.profile_path, 'w185'));
  }
}

async function decodeAndExtract(imageUrl: string): Promise<ExtractedPalette | null> {
  try {
    let skData: any = null;
    try {
      skData = await Skia.Data.fromURI(imageUrl);
    } catch {
      // Fallback to fetch below
    }

    if (!skData) {
      const res = await fetch(imageUrl);
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      skData = Skia.Data.fromBytes(new Uint8Array(buffer));
    }

    if (!skData) return null;

    const skImage = Skia.Image.MakeImageFromEncoded(skData);
    if (!skImage) return null;

    const width = skImage.width();
    const height = skImage.height();
    if (width <= 0 || height <= 0) return null;

    // Explicitly request RGBA_8888 conversion so pixel channel order is guaranteed
    const reqInfo = {
      width,
      height,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    };

    let pixels = skImage.readPixels(0, 0, reqInfo);
    let isBGRA = false;

    // Fallback if explicit conversion returns null on older Skia builds
    if (!pixels || pixels.length < 4) {
      pixels = skImage.readPixels();
      const nativeInfo = skImage.getImageInfo();
      isBGRA = nativeInfo?.colorType === ColorType.BGRA_8888;
    }

    if (!pixels || pixels.length < 4) return null;

    // 36 hue bins (10 degrees each)
    const bins = new Array(36).fill(0);
    const binRgb = new Array(36).fill(0).map(() => ({ r: 0, g: 0, b: 0, count: 0 }));

    // Global accumulator for subtle/monochrome backdrops
    let totalR = 0;
    let totalG = 0;
    let totalB = 0;
    let totalSamples = 0;

    const len = pixels.length;
    // Step by 16 bytes = every 4th pixel for speed & broad spatial sampling
    for (let i = 0; i < len; i += 16) {
      const a = pixels[i + 3];
      if (a < 180) continue;

      const r = isBGRA ? pixels[i + 2] : pixels[i];
      const g = pixels[i + 1];
      const b = isBGRA ? pixels[i] : pixels[i + 2];

      const [h, s, l] = rgbToHsl(r, g, b);

      // Skip pure black letterboxes/vignettes (< 0.05) and blown-out highlights (> 0.95)
      if (l < 0.05 || l > 0.95) continue;

      totalR += r;
      totalG += g;
      totalB += b;
      totalSamples++;

      // Filter near-grayscale pixels (s < 0.10) for hue extraction
      if (s < 0.10) continue;

      // Weight combines visual mass (population) with a modest chromatic boost
      // This prevents a tiny 10-pixel logo from overriding a 5000-pixel background!
      const weight = 1.0 + (s * 1.4) * (1.0 - Math.abs(l - 0.45));
      const binIdx = Math.floor(h / 10) % 36;
      bins[binIdx] += weight;
      binRgb[binIdx].r += r;
      binRgb[binIdx].g += g;
      binRgb[binIdx].b += b;
      binRgb[binIdx].count += 1;
    }

    // Find the winning hue bucket
    let bestBin = -1;
    let maxScore = 0;
    for (let i = 0; i < 36; i++) {
      if (bins[i] > maxScore) {
        maxScore = bins[i];
        bestBin = i;
      }
    }

    let avgR = 0;
    let avgG = 0;
    let avgB = 0;
    let h = 0;
    let s = 0;

    if (bestBin !== -1 && binRgb[bestBin].count > 0) {
      avgR = Math.round(binRgb[bestBin].r / binRgb[bestBin].count);
      avgG = Math.round(binRgb[bestBin].g / binRgb[bestBin].count);
      avgB = Math.round(binRgb[bestBin].b / binRgb[bestBin].count);
      [h, s] = rgbToHsl(avgR, avgG, avgB);
    } else if (totalSamples > 0) {
      // Atmospheric monochrome or neutral backdrop
      avgR = Math.round(totalR / totalSamples);
      avgG = Math.round(totalG / totalSamples);
      avgB = Math.round(totalB / totalSamples);
      [h, s] = rgbToHsl(avgR, avgG, avgB);
    } else {
      // Default sleek slate
      avgR = 24;
      avgG = 28;
      avgB = 34;
      h = 220;
      s = 0.15;
    }

    // Refined Pastel Dark Color:
    // Rich, tinted dark background: lightness ~12.5%, saturation ~32%
    // Clearly tinted to the movie's palette without being muddy or pitch black
    const finalSat = Math.max(0.28, Math.min(0.40, s));
    const pastelDark = hslToHex(h, finalSat, 0.125);

    // Multi-stop hero transition gradient:
    // Top: transparent so the hero image shows through crisp and clean
    // Middle: soft 35% ambient tint
    // Bottom: 100% opaque pastelDark matching detailsBg perfectly
    const gradient: [string, string, string] = [
      'transparent',
      `rgba(${avgR}, ${avgG}, ${avgB}, 0.35)`,
      pastelDark,
    ];

    const palette: ExtractedPalette = {
      dominant: hslToHex(h, Math.max(0.60, s), 0.50),
      pastelDark,
      gradient,
    };

    paletteCache.set(imageUrl, palette);
    return palette;
  } catch (error) {
    return null;
  }
}

/**
 * React hook to automatically extract and observe the ambient palette for a given image URL.
 *
 * `loading`/`failed` are derived synchronously (not in an effect), so callers can
 * render a stable pending state on the very first frame instead of flashing the
 * default theme for one frame before the effect runs.
 */
export function useImagePalette(imageUrl?: string | null): {
  palette: ExtractedPalette | null;
  loading: boolean;
  failed: boolean;
} {
  const [palette, setPalette] = useState<ExtractedPalette | null>(() => {
    return imageUrl && paletteCache.has(imageUrl) ? paletteCache.get(imageUrl)! : null;
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);

    if (!imageUrl) {
      setPalette(null);
      return;
    }

    const cached = paletteCache.get(imageUrl);
    if (cached) {
      setPalette(cached);
      return;
    }

    // New, uncached image: clear any stale palette while the new one extracts.
    setPalette(null);

    let isMounted = true;

    extractPaletteFromUrl(imageUrl).then((result) => {
      if (!isMounted) return;
      setPalette(result);
      if (!result) setFailed(true);
    });

    return () => {
      isMounted = false;
    };
  }, [imageUrl]);

  const loading = Boolean(imageUrl) && !palette && !failed;

  return { palette, loading, failed };
}
