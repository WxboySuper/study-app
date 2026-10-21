import type { ImageStyle, StyleProp } from 'react-native';
import { Image, StyleSheet, Text, View } from 'react-native';

import { resolveArt } from '@/content/art';

import { fallbackFor } from './assets';

/**
 * A sprite of the fishing mode.
 *
 * The art resolver of the app (`src/content/art.ts`) returns the PNG of the
 * catch, or the placeholder of its type when the PNG does not exist (yet),
 * so the game always looks right and never blocks on missing art.
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
  const art = resolveArt(assetId);
  const diameter = Math.max(8, size - inset * 2);

  if (!art.placeholder) {
    return (
      <Image
        source={art.source}
        resizeMode="contain"
        style={[{ width: size, height: size }, style]}
        accessibilityIgnoresInvertColors
      />
    );
  }

  // The art is missing: the placeholder of the type is shown, with the emoji
  // of the catch on its belly.
  const fallback = fallbackFor(assetId);

  return (
    <View
      style={[
        styles.circle,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: fallback.color,
          paddingBottom: diameter * 0.06,
        },
        style,
      ]}
    >
      <Image
        source={art.source}
        resizeMode="contain"
        style={StyleSheet.absoluteFill}
        accessibilityIgnoresInvertColors
      />
      <Text style={{ fontSize: Math.max(10, diameter * 0.34) }}>{fallback.emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
});
