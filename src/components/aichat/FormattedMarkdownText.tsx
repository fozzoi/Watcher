import React from 'react';
import { Text, TextStyle, StyleSheet } from 'react-native';

interface FormattedMarkdownTextProps {
  text: string;
  style?: TextStyle | TextStyle[];
  baseColor?: string;
  boldColor?: string;
}

/**
 * Parses markdown inline formatting (**bold**, *italic*, `code`) and renders
 * native nested <Text> elements with full line-wrapping and styling.
 */
export const FormattedMarkdownText: React.FC<FormattedMarkdownTextProps> = ({
  text,
  style,
  baseColor = '#E0E0E0',
  boldColor = '#FFFFFF',
}) => {
  if (!text) return null;

  // Regex to split by markdown tokens:
  // 1. **bold** or __bold__
  // 2. *italic* or _italic_
  // 3. `code`
  const regex = /(\*\*.*?\*\*|__.*?__|\*.*?\*|_.*?_|`.*?`)/g;
  const parts = text.split(regex);

  return (
    <Text style={[{ color: baseColor }, style]}>
      {parts.map((part, index) => {
        if (!part) return null;

        // **Bold** or __Bold__
        if (
          (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
          (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
        ) {
          const content = part.slice(2, -2);
          return (
            <Text
              key={index}
              style={[styles.bold, { color: boldColor }]}
            >
              {content}
            </Text>
          );
        }

        // *Italic* or _Italic_
        if (
          (part.startsWith('*') && part.endsWith('*') && part.length >= 2 && !part.startsWith('**')) ||
          (part.startsWith('_') && part.endsWith('_') && part.length >= 2 && !part.startsWith('__'))
        ) {
          const content = part.slice(1, -1);
          return (
            <Text
              key={index}
              style={[styles.italic, { color: baseColor }]}
            >
              {content}
            </Text>
          );
        }

        // `Code`
        if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
          const content = part.slice(1, -1);
          return (
            <Text
              key={index}
              style={styles.code}
            >
              {content}
            </Text>
          );
        }

        // Regular Text
        return <Text key={index} style={{ color: baseColor }}>{part}</Text>;
      })}
    </Text>
  );
};

export default FormattedMarkdownText;

const styles = StyleSheet.create({
  bold: {
    fontWeight: '700',
    fontFamily: 'GoogleSansFlex-Bold',
  },
  italic: {
    fontStyle: 'italic',
  },
  code: {
    fontFamily: 'monospace',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#FF6B6B',
  },
});
