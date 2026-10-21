import type { ImageStyle, StyleProp } from 'react-native';
import { Image, StyleSheet, Text, View } from 'react-native';

import { fallbackFor, fishingSprite } from './assets';

/**
 * A sprite of the fishing mode.
 *
 * When the PNG does not exist (yet) the sprite falls back to a coloured
 * circle with the emoji of the catch, so the game always looks right and
 * never blocks on missing art.
 */
export interface SpriteProps {
  /** The asset id (see `docs/design/fishing.md` §13a). */
  assetId: string;
  /** The width and the height of the sprite. */
  size: number;
  /** Extra styles for the sprite (position, margin...). */
  style?: StyleProp<ImageStyle>;
  /** Makes the circle a bit smaller than the sprite. */
  inset?: number;
}

export function Sprite({ assetId, size, style, inset = 0 }: SpriteProps) {
  const source = fishingSprite(assetId);

  if (source !== null) {
    return (
      <Image
        source={source}
        resizeMode="contain"
        style={[{ width: size, height: size }, style]}
        accessibilityIgnoresInvertColors
      />
    );
  }

  const fallback = fallbackFor(assetId);
  const diameter = Math.max(8, size - inset * 2);

  return (
    <View
      style={[
        styles.circle,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: fallback.color,
        },
        style,
      ]}
    >
      <Text style={{ fontSize: Math.max(10, diameter * 0.55) }}>{fallback.emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
