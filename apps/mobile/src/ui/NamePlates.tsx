import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { namePlates } from '../game3d/Crowd';
import { theme } from './theme';

/** Zo vaak worden de bordjes verplaatst. */
const REFRESH_MS = 80;

/**
 * De naambordjes boven andere spelers.
 *
 * Bewust geen 3D-tekst: React Native heeft geen canvas om letters op te
 * tekenen, en gewone Views geven scherpe tekst op elke schermdichtheid. De
 * 3D-laag rekent elke frame uit waar iemand op het scherm staat; hier wordt
 * dat een paar keer per seconde uitgelezen. Vaker heeft geen zin — een bordje
 * dat een halve tel achterloopt zie je niet, een hertekening van de hele HUD
 * op zestig beelden per seconde wel.
 */
export function NamePlates() {
  const [plates, setPlates] = useState(namePlates.current);

  useEffect(() => {
    const timer = setInterval(() => setPlates([...namePlates.current]), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {plates.map((plate) =>
        plate.visible ? (
          <View key={plate.id} style={[styles.plate, { left: plate.x - 70, top: plate.y - 16 }]}>
            <Text numberOfLines={1} style={styles.name}>
              {plate.name}
            </Text>
            <Text style={styles.level}>lvl {plate.level}</Text>
          </View>
        ) : null,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    position: 'absolute',
    width: 140,
    alignItems: 'center',
  },
  name: {
    color: theme.color.text,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(11, 16, 32, 0.72)',
    overflow: 'hidden',
  },
  level: {
    color: theme.color.textDim,
    fontSize: 10,
    marginTop: 1,
  },
});
