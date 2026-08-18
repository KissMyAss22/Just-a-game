import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { CityScene } from '../../src/game3d/CityScene';
import { useGame } from '../../src/state/useGame';
import { Joystick, LookControl } from '../../src/ui/Controls';
import { HUD } from '../../src/ui/HUD';
import { theme } from '../../src/ui/theme';

export default function CityScreen() {
  const syncSpawns = useGame((s) => s.syncSpawns);
  const pushPosition = useGame((s) => s.pushPosition);

  // Alleen terwijl je écht in de stad bent: items ophalen en je positie
  // doorgeven. In de menu's staat dit stil, dat scheelt verkeer en batterij.
  useFocusEffect(
    useCallback(() => {
      void syncSpawns();
      const spawnTimer = setInterval(() => void syncSpawns(), 5_000);
      const positionTimer = setInterval(() => void pushPosition(), 2_000);
      return () => {
        clearInterval(spawnTimer);
        clearInterval(positionTimer);
        void pushPosition();
      };
    }, [syncSpawns, pushPosition]),
  );

  return (
    <View style={styles.container}>
      <CityScene />
      <LookControl />
      <HUD />
      <Joystick />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
});
