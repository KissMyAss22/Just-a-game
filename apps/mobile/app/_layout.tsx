import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useGame } from '../src/state/useGame';
import { theme } from '../src/ui/theme';

export default function RootLayout() {
  const boot = useGame((s) => s.boot);
  const refresh = useGame((s) => s.refresh);
  const status = useGame((s) => s.status);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Periodiek bijwerken zodat kluis, level en quests kloppen, ook als je
  // lang in een menu blijft hangen.
  useEffect(() => {
    if (status !== 'ready') return;
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
  }, [status, refresh]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.color.bg } }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
