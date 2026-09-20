// src/components/aichat/FormattedMarkdownText.tsx
//
// Lightweight markdown for chat bubbles.
// Blocks:  paragraphs, # headings, - / * / • bullets, 1. numbered, > quotes, ``` code, ---
// Inline:  **bold**, *italic*, ~~strike~~, `code`, [label](https://url)
// Also converts literal "\n" (double-escaped model output) into real line breaks.
// A single paragraph renders as a plain <Text>, so existing flex/row layouts keep working.

import React, { memo, useMemo } from 'react';
import { Linking, Platform, StyleProp, StyleSheet, Text, TextStyle, View } from 'react-native';
import { ai } from './aiTheme';

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
  /** Colour of normal text. Falls back to style.color, then the theme. */
  baseColor?: string;
  boldColor?: string;
  linkColor?: string;
  selectable?: boolean;
}

type Block =
  | { t: 'p'; text: string }
  | { t: 'h'; level: number; text: string }
  | { t: 'li'; marker: string; text: string; depth: number }
  | { t: 'quote'; text: string }
  | { t: 'code'; text: string }
  | { t: 'hr' };

const INLINE_RE =
  /(\*\*[^*\n]+?\*\*|`[^`\n]+`|~~[^~\n]+~~|\[[^\]\n]+\]\([^)\s]+\)|\*[^*\s][^*\n]*?\*)/g;

function parseBlocks(src: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  let code: string[] | null = null;
  const flush = () => {
    if (para.length) {
      out.push({ t: 'p', text: para.join('\n') });
      para = [];
    }
  };

  const lines = src.replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').split('\n');
  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (code) {
        out.push({ t: 'code', text: code.join('\n') });
        code = null;
      } else {
        flush();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    if (!trimmed) {
      flush();
      continue;
    }

    let m: RegExpMatchArray | null;
    if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
      flush();
      out.push({ t: 'hr' });
    } else if ((m = trimmed.match(/^(#{1,4})\s+(.+)$/))) {
      flush();
      out.push({ t: 'h', level: m[1].length, text: m[2] });
    } else if ((m = line.match(/^(\s*)[-*•]\s+(.+)$/))) {
      flush();
      out.push({ t: 'li', marker: '•', text: m[2], depth: Math.min(2, Math.floor(m[1].length / 2)) });
    } else if ((m = line.match(/^(\s*)(\d{1,2})[.)]\s+(.+)$/))) {
      flush();
      out.push({ t: 'li', marker: `${m[2]}.`, text: m[3], depth: Math.min(2, Math.floor(m[1].length / 2)) });
    } else if ((m = trimmed.match(/^>\s?(.*)$/))) {
      flush();
      const last = out[out.length - 1];
      if (last?.t === 'quote') last.text += '\n' + m[1];
      else out.push({ t: 'quote', text: m[1] });
    } else {
      para.push(line);
    }
  }
  if (code) out.push({ t: 'code', text: (code as string[]).join('\n') });
  flush();
  return out;
}

const openUrl = (url: string) => {
  if (/^(https?:\/\/|mailto:)/i.test(url)) Linking.openURL(url).catch(() => {});
};

function renderInline(s: string, boldColor: string, linkColor: string): React.ReactNode[] {
  // split() with one capture group => matched tokens sit at odd indexes
  return s.split(INLINE_RE).map((part, i) => {
    if (!part) return null;
    if (i % 2 === 0) return part;

    if (part.startsWith('**')) {
      return (
        <Text key={i} style={[styles.bold, { color: boldColor }]}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith('~~')) {
      return (
        <Text key={i} style={styles.strike}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith('`')) {
      return (
        <Text key={i} style={styles.code}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    if (part.startsWith('[')) {
      const m = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (m) {
        return (
          <Text key={i} style={[styles.link, { color: linkColor }]} onPress={() => openUrl(m[2])}>
            {m[1]}
          </Text>
        );
      }
      return part;
    }
    return (
      <Text key={i} style={styles.italic}>
        {part.slice(1, -1)}
      </Text>
    );
  });
}

export const FormattedMarkdownText = memo(
  ({ text, style, baseColor, boldColor = '#FFFFFF', linkColor = ai.link, selectable }: Props) => {
    const blocks = useMemo(() => parseBlocks(text ?? ''), [text]);
    if (!blocks.length) return null;

    const flat = (StyleSheet.flatten(style) || {}) as TextStyle;
    const color = baseColor ?? (flat.color as string | undefined) ?? ai.text;
    const fontSize = flat.fontSize ?? 14;
    const lineHeight = flat.lineHeight ?? Math.round(fontSize * 1.45);
    const inline = (s: string) => renderInline(s, boldColor, linkColor);

    // Fast path: one paragraph -> plain Text (keeps flex / row layouts intact)
    if (blocks.length === 1 && blocks[0].t === 'p') {
      return (
        <Text selectable={selectable} style={[flat, { color, fontSize, lineHeight }]}>
          {inline(blocks[0].text)}
        </Text>
      );
    }

    const body: TextStyle = { color, fontSize, lineHeight };

    return (
      <View style={[styles.wrap, flat.flex != null && { flex: flat.flex }]}>
        {blocks.map((b, i) => {
          switch (b.t) {
            case 'p':
              return (
                <Text key={i} selectable={selectable} style={body}>
                  {inline(b.text)}
                </Text>
              );
            case 'h': {
              const size = fontSize + Math.max(1, 5 - b.level);
              return (
                <Text
                  key={i}
                  selectable={selectable}
                  style={[styles.bold, { color: boldColor, fontSize: size, lineHeight: Math.round(size * 1.35), marginTop: 2 }]}
                >
                  {inline(b.text)}
                </Text>
              );
            }
            case 'li':
              return (
                <View key={i} style={[styles.liRow, { paddingLeft: b.depth * 14 }]}>
                  <Text style={[body, styles.marker]}>{b.marker}</Text>
                  <Text selectable={selectable} style={[body, styles.liText]}>
                    {inline(b.text)}
                  </Text>
                </View>
              );
            case 'quote':
              return (
                <View key={i} style={styles.quote}>
                  <Text selectable={selectable} style={[body, { color: ai.textDim }]}>
                    {inline(b.text)}
                  </Text>
                </View>
              );
            case 'code':
              return (
                <View key={i} style={styles.codeBlock}>
                  <Text selectable={selectable} style={[styles.codeBlockText, { fontSize: fontSize - 1 }]}>
                    {b.text}
                  </Text>
                </View>
              );
            case 'hr':
              return <View key={i} style={styles.hr} />;
          }
        })}
      </View>
    );
  }
);

FormattedMarkdownText.displayName = 'FormattedMarkdownText';
export default FormattedMarkdownText;

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

const styles = StyleSheet.create({
  wrap: { gap: 6, flexShrink: 1 },
  bold: { fontWeight: '700', fontFamily: 'GoogleSansFlex-Bold' },
  italic: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  link: { textDecorationLine: 'underline' },
  code: {
    fontFamily: MONO,
    backgroundColor: 'rgba(255,255,255,0.10)',
    color: '#FF8A8A',
  },
  liRow: { flexDirection: 'row', alignItems: 'flex-start' },
  marker: { minWidth: 18, color: ai.textMute },
  liText: { flex: 1 },
  quote: {
    borderLeftWidth: 2,
    borderLeftColor: ai.accentLine,
    paddingLeft: 10,
  },
  codeBlock: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: 10,
  },
  codeBlockText: { fontFamily: MONO, color: ai.textDim },
  hr: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginVertical: 4,
  },
});