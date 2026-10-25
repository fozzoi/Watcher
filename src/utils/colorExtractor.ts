import { useEffect, useState } from 'react';
import { Skia } from '@shopify/react-native-skia';

export interface ExtractedPalette {
  dominant: string;
  pastelDark: string;
  gradient: [string, string, string];
}

// In-memory cache to make re-renders and repeat visits instantaneous
const paletteCache = new Map<string, ExtractedPalette>();

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
 */
export async function extractPaletteFromUrl(imageUrl: string): Promise<ExtractedPalette | null> {
  if (!imageUrl) return null;
  if (paletteCache.has(imageUrl)) {
    return paletteCache.get(imageUrl)!;
  }

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const skData = Skia.Data.fromBytes(new Uint8Array(buffer));
    const skImage = Skia.Image.MakeImageFromEncoded(skData);
    if (!skImage) return null;

    const pixels = skImage.readPixels();
    if (!pixels || pixels.length < 4) return null;

    // 36 hue bins (10 degrees each)
    const bins = new Array(36).fill(0);
    const binRgb = new Array(36).fill(0).map(() => ({ r: 0, g: 0, b: 0, count: 0 }));

    // Sample pixels across the image (step by 16 bytes = every 4th pixel)
    const len = pixels.length;
    for (let i = 0; i < len; i += 16) {
      const a = pixels[i + 3];
      if (a < 200) continue;

      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      const [h, s, l] = rgbToHsl(r, g, b);

      // Filter extreme blacks, extreme whites, and near-grayscale mud
      if (l < 0.12 || l > 0.88 || s < 0.18) continue;

      // Score favoring vibrant, rich colors (Apple Music aesthetic)
      const vibrancyScore = s * 2.0 + (0.5 - Math.abs(l - 0.5));
      const binIdx = Math.floor(h / 10) % 36;
      bins[binIdx] += vibrancyScore;
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

    if (bestBin === -1 || binRgb[bestBin].count === 0) {
      return null;
    }

    const avgR = Math.round(binRgb[bestBin].r / binRgb[bestBin].count);
    const avgG = Math.round(binRgb[bestBin].g / binRgb[bestBin].count);
    const avgB = Math.round(binRgb[bestBin].b / binRgb[bestBin].count);

    const [h, s] = rgbToHsl(avgR, avgG, avgB);

    // Soft desaturated pastel dark color from the image (consistent across all modes)
    const pastelDark = hslToHex(h, 0.22, 0.13);

    const gradient: [string, string, string] = [
      `rgba(${avgR}, ${avgG}, ${avgB}, 0.05)`,
      `rgba(${avgR}, ${avgG}, ${avgB}, 0.22)`,
      pastelDark,
    ];

    const palette: ExtractedPalette = {
      dominant: hslToHex(h, s, 0.5),
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
 */
export function useImagePalette(imageUrl?: string | null): {
  palette: ExtractedPalette | null;
  loading: boolean;
} {
  const [palette, setPalette] = useState<ExtractedPalette | null>(() => {
    return imageUrl && paletteCache.has(imageUrl) ? paletteCache.get(imageUrl)! : null;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!imageUrl) {
      setPalette(null);
      return;
    }

    if (paletteCache.has(imageUrl)) {
      setPalette(paletteCache.get(imageUrl)!);
      return;
    }

    let isMounted = true;
    setLoading(true);

    extractPaletteFromUrl(imageUrl).then((result) => {
      if (isMounted) {
        setPalette(result);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [imageUrl]);

  return { palette, loading };
}
