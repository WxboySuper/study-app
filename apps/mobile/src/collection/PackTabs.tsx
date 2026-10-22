import { LinearGradient } from 'expo-linear-gradient';
import type { PackDef } from '@study-app/core';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { packTheme } from '@/packs/packThemes';
import { colors, fonts, gradientDirection, radius, shadow } from '@/theme';

/**
 * The tabs of the album.
 *
 * One chunky pill per pack: the pill of the open pack sits on a saturated
 * face of its theme and lifts a little, the other pills stay flat and dim.
 * The change of pack is a spring, not a jump.
 */
export interface PackTabsProps {
  /** Every pack of the shop. */
  packs: readonly PackDef[];
  /** The pack that is open. */
  activeId: string;
  /** Called when a pack is picked. */
  onSelect: (packId: string) => void;
}

/** The tabs of the album. */
export function PackTabs({ packs, activeId, onSelect }: PackTabsProps) {
  return (
    <View style={styles.row}>
      {packs.map((pack) => (
        <PackTab
          key={pack.id}
          pack={pack}
          active={pack.id === activeId}
          onPress={() => {
            onSelect(pack.id);
          }}
        />
      ))}
    </View>
  );
}

/** One pill of the tabs. */
function PackTab({
  pack,
  active,
  onPress,
}: {
  pack: PackDef;
  active: boolean;
  onPress: () => void;
}) {
  const theme = packTheme(pack.id);
  const lift = useSharedValue(active ? 1 : 0);
  const glow = useSharedValue(active ? 1 : 0);

  // The pill springs up when its pack is opened.
  useEffect(() => {
    lift.value = withSpring(active ? 1 : 0, { damping: 14, stiffness: 180, mass: 0.7 });
    glow.value = withTiming(active ? 1 : 0, { duration: 200, easing: Easing.out(Easing.quad) });
  }, [active, glow, lift]);

  const faceStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.value * 3 }, { scale: 1 + lift.value * 0.04 }],
  }));

  const label = pack.name.split(/[—-]/)[0]?.trim() ?? pack.name;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={pack.name}
      onPress={onPress}
      style={styles.press}
    >
      <Animated.View style={[styles.pill, active ? styles.pillOn : styles.pillOff, pillStyle]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, faceStyle]}>
          <LinearGradient
            colors={theme.gradient}
            start={gradientDirection.start}
            end={gradientDirection.end}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View style={styles.dot} />
        <Text style={[styles.label, active && styles.labelOn]} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  press: {
    flex: 1,
  },
  pill: {
    minHeight: 46,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillOff: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pillOn: {
    borderColor: 'rgba(255,255,255,0.3)',
    ...shadow.soft,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.titleSemi,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  labelOn: {
    color: '#ffffff',
    fontFamily: fonts.title,
  },
});
