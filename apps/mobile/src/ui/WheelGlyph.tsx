import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { spinSegmentColors } from '@/theme';
/**
 * The little wheel of the daily spin.
 *
 * The same eight segments as the real wheel, drawn small: the tile of the
 * home screen shows the wheel of the game instead of an emoji.
 */
export interface WheelGlyphProps {
  /** The diameter of the wheel. */
  size?: number;
  /** The style of the root. */
  style?: StyleProp<ViewStyle>;
}

/** A small wheel of the daily spin. */
export function WheelGlyph({ size = 56, style }: WheelGlyphProps) {
  const radius = size / 2;
  const segments = spinSegmentColors.length;
  const step = (Math.PI * 2) / segments;

  const wedges = spinSegmentColors.map((color, index) => {
    const start = index * step - Math.PI / 2;
    const end = start + step;
    const x1 = radius + radius * Math.cos(start);
    const y1 = radius + radius * Math.sin(start);
    const x2 = radius + radius * Math.cos(end);
    const y2 = radius + radius * Math.sin(end);
    const path = `M ${radius} ${radius} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`;
    return { key: index, color, path };
  });

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {wedges.map((wedge) => (
          <Path key={wedge.key} d={wedge.path} fill={wedge.color} />
        ))}
        <Path
          d={`M ${radius} ${radius} m -${radius * 0.22} 0 a ${radius * 0.22} ${radius * 0.22} 0 1 0 ${radius * 0.44} 0 a ${radius * 0.22} ${radius * 0.22} 0 1 0 -${radius * 0.44} 0`}
          fill="#ffffff"
        />
      </Svg>
    </View>
  );
}
