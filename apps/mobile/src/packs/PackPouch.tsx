import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/**
 * The pouch of a pack.
 *
 * A sealed bag with a crimped top: the gradient of the theme of the pack,
 * a lighter band on the sealed edge and a shadow on the bottom, so it looks
 * like an object the player is holding.
 */
export interface PackPouchProps {
  /** The gradient of the pouch. */
  gradient: readonly string[];
  /** The gradient of the sealed edge. */
  crimp: readonly string[];
  /** The width of the pouch. */
  width?: number;
  /** The height of the pouch. */
  height?: number;
}

/** The pouch of a pack. */
export function PackPouch({ gradient, crimp, width = 132, height = 156 }: PackPouchProps) {
  const rawId = useId();
  const id = `pouch${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const crimpId = `crimp${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const viewWidth = 200;
  const viewHeight = 236;

  // The sawtooth of the sealed edge.
  const teeth = 9;
  let crimpPath = 'M 12 50';
  for (let index = 0; index < teeth; index += 1) {
    const left = 12 + (index * (viewWidth - 24)) / teeth;
    const right = 12 + ((index + 1) * (viewWidth - 24)) / teeth;
    const middle = (left + right) / 2;
    crimpPath += ` L ${left} 50 L ${middle} 26 L ${right} 50`;
  }
  crimpPath += ' L 188 62 L 12 62 Z';

  const bodyPath =
    'M 12 50 L 188 50 L 188 210 Q 188 226 172 226 L 28 226 Q 12 226 12 210 Z';

  return (
    <View style={[styles.root, { width, height }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${viewWidth} ${viewHeight}`}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0.6" y2="1">
            <Stop offset="0" stopColor={gradient[0] ?? '#7b61ff'} />
            <Stop offset="1" stopColor={gradient[1] ?? '#4f7dff'} />
          </LinearGradient>
          <LinearGradient id={crimpId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={crimp[0] ?? '#c4b5fd'} />
            <Stop offset="1" stopColor={crimp[1] ?? '#60a5fa'} />
          </LinearGradient>
        </Defs>

        <Path d={bodyPath} fill={`url(#${id})`} />
        <Path d={crimpPath} fill={`url(#${crimpId})`} />

        {/* The shine of the pouch. */}
        <Path
          d="M 30 66 L 52 66 L 40 212 L 26 212 Z"
          fill="rgba(255,255,255,0.14)"
        />
        {/* The shadow of the bottom. */}
        <Path d="M 12 206 L 188 206 L 188 210 Q 188 226 172 226 L 28 226 Q 12 226 12 210 Z" fill="rgba(0,0,0,0.25)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
