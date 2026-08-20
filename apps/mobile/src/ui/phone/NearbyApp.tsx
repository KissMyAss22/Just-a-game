import { getVehicle } from '@game/shared';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { realtime, remotePlayers } from '../../net/presence';
import { navigationTarget, playerPosition } from '../../state/position';
import { Empty } from '../components';
import { theme } from '../theme';

/**
 * Wie er op dit moment bij je in de buurt loopt.
 *
 * Nog geen vriendenlijst met verzoeken en een online-status: dat heeft pas zin
 * als je elkaar ook iets kunt zeggen, en chat en spraak vragen om filteren,
 * blokkeren en rapporteren. Dat hoort in één ronde thuis, niet half.
 *
 * Wat dit wél doet is het enige wat je nu echt aan een lijst hebt: zien wie er
 * is, en er met één tik naartoe kunnen lopen.
 */

interface Entry {
  id: string;
  name: string;
  level: number;
  vehicleId: string;
  driving: boolean;
  x: number;
  z: number;
  distance: number;
}

export function NearbyApp() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [connected, setConnected] = useState(realtime.connected);
  const [chosen, setChosen] = useState<string | null>(navigationTarget.current?.label ?? null);

  useEffect(() => {
    const tick = () => {
      setConnected(realtime.connected);
      setEntries(
        [...remotePlayers.values()]
          .map((p) => ({
            id: p.latest.id,
            name: p.latest.n,
            level: p.latest.level,
            vehicleId: p.latest.v,
            driving: p.latest.d === 1,
            x: p.latest.x,
            z: p.latest.z,
            distance: Math.hypot(p.latest.x - playerPosition.x, p.latest.z - playerPosition.z),
          }))
          .sort((a, b) => a.distance - b.distance),
      );
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!connected) {
    return <Empty text="Geen verbinding met de gedeelde wereld." />;
  }
  if (entries.length === 0) {
    return <Empty text="Je bent hier in je eentje. Andere spelers zie je binnen 170 meter." />;
  }

  return (
    <View>
      {entries.map((entry) => {
        const vehicle = getVehicle(entry.vehicleId);
        const active = chosen === entry.name;
        return (
          <Pressable
            key={entry.id}
            onPress={() => {
              if (active) {
                navigationTarget.current = null;
                setChosen(null);
                return;
              }
              navigationTarget.current = { x: entry.x, z: entry.z, label: entry.name };
              setChosen(entry.name);
            }}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.icon}>{entry.driving ? vehicle.icon : '🚶'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{entry.name}</Text>
              <Text style={styles.meta}>
                level {entry.level} · {Math.round(entry.distance)} m
                {entry.driving ? ` · rijdt in een ${vehicle.name.toLowerCase()}` : ''}
              </Text>
            </View>
            <Text style={[styles.action, active && { color: theme.color.accent }]}>
              {active ? 'volgt' : 'ga heen'}
            </Text>
          </Pressable>
        );
      })}
      <Text style={styles.hint}>
        Een naam aantikken zet de pijl in beeld naar waar diegene stond. Hij loopt niet mee — dat
        vraagt om echte vrienden en een berichtenapp, en die komen samen met de chat.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  icon: { fontSize: 20, width: 28, textAlign: 'center' },
  name: { color: theme.color.text, fontSize: 15, fontWeight: '700' },
  meta: { color: theme.color.textDim, fontSize: 12, marginTop: 2 },
  action: { color: theme.color.textDim, fontSize: 12, fontWeight: '700' },
  hint: { color: theme.color.textDim, fontSize: 11, marginTop: 12, lineHeight: 16 },
});
