import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts } from '@/theme';

import { Glow } from './Glow';

/**
 * The wordmark of the game.
 *
 * The name is carved out of the background: a violet halo behind it, a few
 * extruded layers under the letters and a soft shadow, the way a logo of a
 * mobile game is drawn.
 */
export interface WordmarkProps {
  /** The name of the game. */
  text?: string;
  /** The size of the letters. */
  size?: number;
  /** The style of the root. */
  style?: StyleProp<ViewStyle>;
}

/** The logo of the game. */
export function Wordmark({ text = 'CramCritters', size = 42, style }: WordmarkProps) {
  const layers = [
    { offset: 5, color: colors.primaryDark },
    { offset: 4, color: '#4a2fc7' },
    { offset: 3, color: '#5b45c9' },
    { offset: 2, color: '#6d51e8' },
  ];

  return (
    <View style={[styles.root, style]}>
      <Glow color={colors.primary} size={size * 4.2} opacity={0.5} style={styles.glow} />
      {layers.map((layer) => (
        <Text
          key={layer.offset}
          style={[
            styles.text,
            styles.layer,
            {
              fontSize: size,
              color: layer.color,
              transform: [{ translateY: layer.offset }],
            },
          ]}
        >
          {text}
        </Text>
      ))}
      <Text
        style={[
          styles.text,
          styles.front,
          {
            fontSize: size,
          },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
  },
  text: {
    color: colors.text,
    fontFamily: fonts.title,
    letterSpacing: 1.5,
  },
  layer: {
    position: 'absolute',
    top: 0,
  },
  front: {
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 8,
  },
});
