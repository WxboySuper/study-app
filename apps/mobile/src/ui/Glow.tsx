import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

/**
 * A radial glow.
 *
 * The focal elements of the game (the play button, the critter that came
 * out of a pack, the counter of the tokens) sit on a soft colored halo,
 * which is what makes the screen look alive instead of flat.
 */
export interface GlowProps {
  /** The color of the halo. */
  color: string;
  /** The size of the halo (its diameter). */
  size: number;
  /** How strong the halo is (0 to 1). */
  opacity?: number;
  /** Where the halo sits. */
  style?: StyleProp<ViewStyle>;
  /** The content that sits on the halo. */
  children?: ReactNode;
}

/** A radial gradient that fades out to nothing. */
export function Glow({ color, size, opacity = 0.55, style, children }: GlowProps) {
  const rawId = useId();
  const id = `glow${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const half = size / 2;

  return (
    <View pointerEvents="none" style={[styles.root, { width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="0.45" stopColor={color} stopOpacity={opacity * 0.45} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={half} cy={half} r={half} fill={`url(#${id})`} />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
