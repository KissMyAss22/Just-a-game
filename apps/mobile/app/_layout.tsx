import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useGame } from '../src/state/useGame';
import { useSettings } from '../src/state/useSettings';
import { theme } from '../src/ui/theme';

export default function RootLayout() {
  const boot = useGame((s) => s.boot);
  const refresh = useGame((s) => s.refresh);
  const status = useGame((s) => s.status);
  const loadSettings = useSettings((s) => s.load);

  useEffect(() => {
    void boot();
    // De grafische stand komt van het toestel zelf en moet er zijn voordat de
    // 3D-scene wordt opgebouwd; die leest hem één keer bij het aanmaken.
    void loadSettings();
  }, [boot, loadSettings]);

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
