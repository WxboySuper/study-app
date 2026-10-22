import {
  Fredoka_600SemiBold,
  Fredoka_700Bold,
} from '@expo-google-fonts/fredoka';
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
} from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaProvider, type EdgeInsets } from 'react-native-safe-area-context';

import { SettingsProvider } from '@/settings';
import { startDeckSync } from '@/sync/syncDecks';
import { colors } from '@/theme';
import { startUpdateChecks } from '@/update/checkForUpdate';

/**
 * The root of the app.
 *
 * The fonts are the identity of the game: Fredoka draws the titles, the
 * buttons and the numbers, Nunito the body. The splash screen is held
 * until they are loaded, so the first frame is already the real thing.
 */

void SplashScreen.preventAutoHideAsync().catch(() => {
  // The splash screen is already hidden; nothing to do.
});

SplashScreen.setOptions({ duration: 250, fade: true });

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });

  useEffect(() => {
    if (loaded || error !== null) {
      void SplashScreen.hideAsync().catch(() => {
        // The splash screen is already hidden; nothing to do.
      });
    }
  }, [loaded, error]);

  // The app looks for a new release when it starts, and again every six
  // hours when it comes back from the background.
  useEffect(() => {
    return startUpdateChecks();
  }, []);

  // The decks of the server are pulled when the app starts, and again when it
  // comes back from the background (at most once every ten minutes).
  useEffect(() => {
    return startDeckSync();
  }, []);

  if (!loaded && error === null) {
    return <View style={{ flex: 1, backgroundColor: colors.backgroundDeep }} />;
  }

  return (
    <SafeAreaProvider>
    <SimulatedInsets>
    <SettingsProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          // The screens are dark: the content keeps the deep background, so
          // the app never flashes white between two screens.
          contentStyle: { backgroundColor: colors.backgroundDeep },
          animation: 'fade_from_bottom',
          animationDuration: 260,
          gestureEnabled: true,
          gestureDirection: 'vertical',
          fullScreenGestureEnabled: true,
        }}
      >
        <Stack.Screen name="index" options={{ title: 'CramCritters', animation: 'fade' }} />
        <Stack.Screen
          name="import"
          options={{ title: 'Import deck', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="fishing"
          options={{ title: 'Fishing', animation: 'fade_from_bottom' }}
        />
        <Stack.Screen name="packs" options={{ title: 'Pack Shop', animation: 'slide_from_right' }} />
        <Stack.Screen
          name="collection"
          options={{ title: 'Collection', animation: 'slide_from_right' }}
        />
        <Stack.Screen name="deck" options={{ title: 'Deck', animation: 'slide_from_right' }} />
        <Stack.Screen name="spin" options={{ title: 'Daily Spin', animation: 'slide_from_right' }} />
      </Stack>
      <StatusBar style="light" />
    </SettingsProvider>
    </SimulatedInsets>
    </SafeAreaProvider>
  );
}

/**
 * The web build can fake the insets of a phone (`?insets=48,32` is a 48 px
 * status bar and a 32 px gesture bar), so the screenshots show how the
 * screens clear the system bars of Android.
 */
function SimulatedInsets({ children }: { children: ReactNode }) {
  const simulated = readSimulatedInsets();
  if (simulated === null) {
    return <>{children}</>;
  }
  return <SafeAreaInsetsContext.Provider value={simulated}>{children}</SafeAreaInsetsContext.Provider>;
}

/** Reads `?insets=top,bottom` on the web (`null` elsewhere). */
function readSimulatedInsets(): EdgeInsets | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }
  const match = /[?&]insets=(\d+),(\d+)/.exec(window.location.search);
  if (match === null) {
    return null;
  }
  return { top: Number(match[1]), bottom: Number(match[2]), left: 0, right: 0 };
}
