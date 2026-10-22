import { splitMathSegments } from '@study-app/core';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { MathView } from './MathView';

/**
 * The text of a question or of an answer, with its math.
 *
 * The text is cut into plain parts and math parts (the splitter lives in
 * `@study-app/core`): the plain parts are text, the math parts are drawn by
 * KaTeX (a `WebView` on the phone, HTML in the browser).
 *
 * The plain Unicode still works: `∂` and `∇` are just text.
 */
export interface MathTextProps {
  /** The text of the question or of the answer (it may hold LaTeX). */
  text: string;
  /** The style of the plain text. */
  style?: StyleProp<TextStyle>;
  /** The colour of the math. Defaults to the colour of the text. */
  color?: string;
  /** The size of the math, in points. */
  fontSize?: number;
  /** `true` when the text is centered. */
  center?: boolean;
}

/** The math renderer of the platform (a `WebView` on the phone, HTML on the web). */
export function MathText({ text, style, color, fontSize, center }: MathTextProps) {
  const segments = splitMathSegments(text);

  // A question without math is just text: it keeps the layout of a label.
  if (!segments.some((segment) => segment.type === 'math')) {
    return <Text style={style}>{text}</Text>;
  }

  const size = fontSize ?? 16;
  const tint = color ?? '#ffffff';

  return (
    <View style={[styles.root, center === true ? styles.center : null]}>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return (
            <Text key={index} style={[style, styles.text]}>
              {segment.value}
            </Text>
          );
        }

        return (
          <View key={index} style={segment.block ? styles.block : styles.inline}>
            <MathView
              source={segment.value}
              displayMode={segment.block}
              color={tint}
              fontSize={size}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  center: {
    justifyContent: 'center',
  },
  text: {
    flexShrink: 1,
  },
  inline: {
    flexShrink: 0,
    marginHorizontal: 1,
  },
  block: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 2,
  },
});
