import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { API_URL } from '../src/net/api';
import { useGame } from '../src/state/useGame';
import { Button } from '../src/ui/components';
import { theme } from '../src/ui/theme';

export default function Boot() {
  const status = useGame((s) => s.status);
  const error = useGame((s) => s.error);
  const boot = useGame((s) => s.boot);

  if (status === 'ready') return <Redirect href="/(game)/city" />;

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Just a Game</Text>

      {status === 'boot' ? (
        <>
          <ActivityIndicator color={theme.color.accent} size="large" />
          <Text style={styles.hint}>Verbinden met {API_URL}</Text>
        </>
      ) : (
        <>
          <Text style={styles.error}>{error}</Text>
          <Text style={styles.hint}>
            Controleer of de server draait (pnpm dev:server) en of je telefoon op hetzelfde
            wifi-netwerk zit. Staat de server op een ander adres, zet dan EXPO_PUBLIC_API_URL in
            apps/mobile/.env.
          </Text>
          <Button label="Opnieuw proberen" onPress={() => void boot()} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 18,
  },
  logo: { color: theme.color.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  hint: { color: theme.color.textDim, textAlign: 'center', fontSize: 13, lineHeight: 19 },
  error: { color: theme.color.danger, textAlign: 'center', fontSize: 15, fontWeight: '600' },
});
