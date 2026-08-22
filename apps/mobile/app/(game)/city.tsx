import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { CityScene } from '../../src/game3d/CityScene';
import { joinCity, leaveCity, setDownedHandler } from '../../src/net/realtime';
import { setPlayerPosition } from '../../src/state/position';
import { useGame } from '../../src/state/useGame';
import { Joystick, LookControl } from '../../src/ui/Controls';
import { HUD } from '../../src/ui/HUD';
import { NamePlates } from '../../src/ui/NamePlates';
import { theme } from '../../src/ui/theme';

export default function CityScreen() {
  const syncSpawns = useGame((s) => s.syncSpawns);
  const pushPosition = useGame((s) => s.pushPosition);
  const refresh = useGame((s) => s.refresh);
  const toast = useGame((s) => s.toast);

  // Alleen terwijl je écht in de stad bent: items ophalen en je positie
  // doorgeven. In de menu's staat dit stil, dat scheelt verkeer en batterij.
  useFocusEffect(
    useCallback(() => {
      void syncSpawns();
      // De gedeelde wereld loopt alleen terwijl je in de stad bent. In een
      // menu heeft niemand er iets aan dat je stil op straat staat.
      joinCity();

      // Neergaan in het park. De server zet je terug aan de stadskant en heeft
      // je buidel al op de grond laten vallen; de app hoeft alleen bij te
      // trekken en het te vertellen.
      setDownedHandler((bericht) => {
        setPlayerPosition(bericht.x, bericht.z);
        toast(
          `${bericht.by} heeft je neergehaald`,
          bericht.lost > 0
            ? `Je buidel ligt in het park: ${bericht.lost} ${bericht.lost === 1 ? 'stuk' : 'stuks'}. Wie er als eerste bij is, mag het hebben.`
            : 'Je had niets in je buidel, dus je bent niets kwijt.',
          'epic',
        );
        void refresh();
        void syncSpawns();
      });

      const spawnTimer = setInterval(() => void syncSpawns(), 5_000);
      const positionTimer = setInterval(() => void pushPosition(), 2_000);
      return () => {
        clearInterval(spawnTimer);
        clearInterval(positionTimer);
        setDownedHandler(null);
        leaveCity();
        void pushPosition();
      };
    }, [syncSpawns, pushPosition, refresh, toast]),
  );

  return (
    <View style={styles.container}>
      <CityScene />
      <NamePlates />
      <LookControl />
      <HUD />
      <Joystick />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
});
