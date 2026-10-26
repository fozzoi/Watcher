// src/components/aichat/aiTheme.ts
import { ACCENT_COLOR } from '../../theme';

// Accent-driven tokens derive from the global brand accent so the AI tab
// stays visually in sync with the rest of the app (change ACCENT_COLOR in
// src/theme/colors.ts to retheme everywhere at once).
export const ai = {
  bg: '#0F0F12',
  card: '#141418',
  border: 'rgba(255,255,255,0.08)',
  hairline: 'rgba(255,255,255,0.06)',
  text: '#F2F2F5',
  textDim: '#B4B4BE',
  textMute: '#7C7C88',
  accent: ACCENT_COLOR,
  accentSoft: `${ACCENT_COLOR}24`,
  accentLine: `${ACCENT_COLOR}59`,
  accentText: '#FF6B6B',
  link: '#FF8A8A',
};