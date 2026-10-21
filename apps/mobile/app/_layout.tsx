import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SettingsProvider } from '@/settings';

export default function RootLayout() {
  return (
    <SettingsProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Study' }} />
        <Stack.Screen
          name="fishing"
          options={{ title: 'Fishing', headerShown: false, animation: 'fade' }}
        />
        <Stack.Screen name="packs" options={{ title: 'Pack Shop', animation: 'slide_from_right' }} />
        <Stack.Screen
          name="collection"
          options={{ title: 'Collection', animation: 'slide_from_right' }}
        />
        <Stack.Screen name="spin" options={{ title: 'Daily Spin', animation: 'slide_from_right' }} />
      </Stack>
      <StatusBar style="auto" />
    </SettingsProvider>
  );
}
