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
      </Stack>
      <StatusBar style="auto" />
    </SettingsProvider>
  );
}
