import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { API_URL, fetchHealth } from '../src/net/api';
import { useGame } from '../src/state/useGame';
import { Button } from '../src/ui/components';
import { theme } from '../src/ui/theme';

export default function Boot() {
  const status = useGame((s) => s.status);
  const error = useGame((s) => s.error);
  const errorKind = useGame((s) => s.errorKind);
  const boot = useGame((s) => s.boot);

  // Bij een fout ophalen wélke server daar draait. Dat is de vraag waar deze
  // week de meeste tijd in ging zitten: praat je met de code die je net hebt
  // binnengehaald, of met een venster dat al een uur openstaat?
  const [versie, setVersie] = useState<string | null>(null);
  useEffect(() => {
    if (status !== 'error') return;
    let leeft = true;
    void fetchHealth()
      .then((gezond) => {
        if (leeft) setVersie(gezond.version ?? 'onbekend');
      })
      .catch(() => {
        if (leeft) setVersie(null);
      });
    return () => {
      leeft = false;
    };
  }, [status]);

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
          {/*
            Twee heel verschillende problemen, dus twee verschillende aanwijzingen.
            Eerst stond hier één tekst over wifi en de server die niet draait; bij
            een serverfout klopte daar niets van en ging het zoeken de verkeerde
            kant op.
          */}
          {errorKind === 'server' ? (
            <Text style={styles.hint}>
              De server op {API_URL} antwoordt wél, maar met een fout. Aan je netwerk ligt het
              dus niet. Kijk in het venster van pnpm dev:server: daar staat wat er precies
              misging. Kwam er een tabel bij, dan helpt pnpm db:migrate.
            </Text>
          ) : (
            <Text style={styles.hint}>
              Controleer of de server draait (pnpm dev:server) en of je telefoon op hetzelfde
              wifi-netwerk zit. Staat de server op een ander adres, zet dan EXPO_PUBLIC_API_URL in
              apps/mobile/.env.
            </Text>
          )}
          {versie ? <Text style={styles.hint}>Server draait versie {versie}.</Text> : null}
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
