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
import { useEffect } from 'react';
import { View } from 'react-native';

import { SettingsProvider } from '@/settings';
import { colors } from '@/theme';

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

  if (!loaded && error === null) {
    return <View style={{ flex: 1, backgroundColor: colors.backgroundDeep }} />;
  }

  return (
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
        <Stack.Screen name="spin" options={{ title: 'Daily Spin', animation: 'slide_from_right' }} />
      </Stack>
      <StatusBar style="light" />
    </SettingsProvider>
  );
}
