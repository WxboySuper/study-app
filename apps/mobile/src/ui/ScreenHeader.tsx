import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radius } from '@/theme';

import { GlassCard } from './GlassCard';

/**
 * The header of a game screen.
 *
 * A back button, the name of the place and a slot on the right for the
 * wallet of the player.
 */
export interface ScreenHeaderProps {
  /** The name of the screen. */
  title: string;
  /** A subtitle under the title. */
  subtitle?: string;
  /** The content on the right of the title. */
  right?: React.ReactNode;
  /** Hides the back button (the home screen has none). */
  showBack?: boolean;
  /** The style of the root. */
  style?: StyleProp<ViewStyle>;
}

/** The header of a game screen. */
export function ScreenHeader({ title, subtitle, right, showBack = true, style }: ScreenHeaderProps) {
  const router = useRouter();

  return (
    <View style={[styles.root, style]}>
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/');
            }
          }}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
      ) : (
        <View style={styles.backSpacer} />
      )}

      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle === undefined ? null : (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: radius.button,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.94 }],
  },
  backSpacer: {
    width: 0,
  },
  backGlyph: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 30,
    lineHeight: 34,
    marginTop: -3,
  },
  titles: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 24,
    letterSpacing: 0.8,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
});

/** A small glassy chip that holds a number (the tokens, the tickets). */
export function HeaderChip({ children }: { children: React.ReactNode }) {
  return (
    <GlassCard borderRadius={radius.chip} elevated={false} contentStyle={styles.chip}>
      {children}
    </GlassCard>
  );
}
