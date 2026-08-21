import { CITY, districtAtWorld, nearestShop, shopSpots } from '@game/shared';
import * as api from '../../net/api';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { remotePlayers } from '../../net/presence';
import {
  cameraState,
  navigationTarget,
  playerPosition,
  setPlayerPosition,
} from '../../state/position';
import { useGame } from '../../state/useGame';
import { useSettings } from '../../state/useSettings';
import { Button } from '../components';
import { rarityColor, theme } from '../theme';
import { districtRects, mainRoadRects, waterRects, type MapRect } from './mapShapes';

/**
 * De kaart van de stad.
 *
 * Alles komt uit dezelfde stadsdata als de 3D-wereld, dus de kaart kán niet
 * afwijken van waar je loopt. Tik een marker aan om er een bestemming van te
 * maken; de pijl in de HUD wijst er daarna naartoe.
 */

/** Hoe groot de kaart getekend wordt, in punten. */
const SIZE = 300;

/** Van celcoördinaat naar plek op de kaart. */
const scale = (cells: number): number => (cells / CITY.gridSize) * SIZE;

/** Van wereldcoördinaat naar celcoördinaat, met decimalen. */
const toCell = (world: number): number => world / CITY.cellSize + CITY.originCell;

/** En terug: van een punt op de kaart naar een wereldcoördinaat. */
const toWorld = (point: number): number =>
  ((point / SIZE) * CITY.gridSize - CITY.originCell) * CITY.cellSize;

function Rects({ rects }: { rects: MapRect[] }) {
  return (
    <>
      {rects.map((rect, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            left: scale(rect.cx),
            top: scale(rect.cz),
            width: Math.max(1, scale(rect.w)),
            height: Math.max(1, scale(rect.h)),
            backgroundColor: rect.color,
          }}
        />
      ))}
    </>
  );
}

interface Marker {
  key: string;
  x: number;
  z: number;
  label: string;
  color: string;
  size: number;
  /** Alleen markers met een naam zijn als bestemming te kiezen. */
  target?: { x: number; z: number; label: string };
}

export function MapApp() {
  const spawns = useGame((s) => s.spawns);
  const syncSpawns = useGame((s) => s.syncSpawns);
  const toast = useGame((s) => s.toast);
  const mapTeleport = useSettings((s) => s.mapTeleport);
  const shops = useMemo(() => shopSpots(), []);
  const shapes = useMemo(
    () => ({ districts: districtRects(), water: waterRects(), roads: mainRoadRects() }),
    [],
  );

  // De spelerpositie en de andere spelers leven buiten React; twee keer per
  // seconde een momentopname is ruim genoeg voor een kaart.
  const [me, setMe] = useState({ x: playerPosition.x, z: playerPosition.z, yaw: cameraState.yaw });
  const [others, setOthers] = useState<{ id: string; n: string; x: number; z: number }[]>([]);
  const [chosen, setChosen] = useState<string | null>(navigationTarget.current?.label ?? null);

  useEffect(() => {
    const tick = () => {
      setMe({ x: playerPosition.x, z: playerPosition.z, yaw: cameraState.yaw });
      setOthers(
        [...remotePlayers.values()].map((p) => ({
          id: p.latest.id,
          n: p.latest.n,
          x: p.latest.x,
          z: p.latest.z,
        })),
      );
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, []);

  const markers: Marker[] = [
    ...shops.map((shop) => ({
      key: `shop-${shop.id}`,
      x: shop.x,
      z: shop.z,
      label: shop.name,
      color: theme.color.cash,
      size: 11,
      target: { x: shop.x, z: shop.z, label: shop.name },
    })),
    ...others.map((other) => ({
      key: `player-${other.id}`,
      x: other.x,
      z: other.z,
      label: other.n,
      color: theme.color.gems,
      size: 9,
      target: { x: other.x, z: other.z, label: other.n },
    })),
    // Wat er om je heen ligt. Geen bestemming: die dingen verdwijnen vanzelf,
    // dus ernaartoe navigeren zou je naar een lege stoep sturen.
    ...spawns.map((spawn) => ({
      key: `loot-${spawn.id}`,
      x: spawn.x,
      z: spawn.z,
      label: '',
      color: rarityColor[spawn.rarity] ?? theme.color.accent,
      size: 4,
    })),
  ];

  const district = districtAtWorld(me.x, me.z);
  const shop = nearestShop(me.x, me.z);

  const choose = (marker: Marker): void => {
    if (!marker.target) return;
    if (chosen === marker.label) {
      navigationTarget.current = null;
      setChosen(null);
      return;
    }
    navigationTarget.current = marker.target;
    setChosen(marker.label);
  };

  /**
   * Tikken op de kaart om erheen te springen.
   *
   * Alleen als de teleportstand in het testgereedschap aanstaat. De kaart is
   * ook een scherm voor een gewone speler, en die wil bij een misser niet aan
   * de andere kant van de stad wakker worden. De server toetst het los van dit
   * alles nog een keer: zonder DEV_TOOLS=1 weigert hij gewoon.
   */
  const tapToJump = (px: number, py: number): void => {
    if (!mapTeleport) return;
    void (async () => {
      try {
        const spot = await api.devTeleport({ x: toWorld(px), z: toWorld(py) });
        setPlayerPosition(spot.x, spot.z);
        await syncSpawns();
        toast(`Gesprongen naar ${Math.round(spot.x)}, ${Math.round(spot.z)}`);
      } catch (error) {
        toast('Springen mislukt', error instanceof Error ? error.message : String(error));
      }
    })();
  };

  return (
    <View>
      {/*
        Geen `disabled` maar helemaal geen `onPress` als de stand uit staat: een
        uitgeschakelde knop meldt zich bij een schermlezer nog steeds als knop,
        en de kaart is geen knop. Zo is hij gewoon een vlak, precies als eerst.
      */}
      <Pressable
        style={styles.map}
        onPress={
          mapTeleport
            ? (event) => tapToJump(event.nativeEvent.locationX, event.nativeEvent.locationY)
            : undefined
        }
      >
        <Rects rects={shapes.districts} />
        <Rects rects={shapes.water} />
        <Rects rects={shapes.roads} />

        {markers.map((marker) => {
          const left = scale(toCell(marker.x)) - marker.size / 2;
          const top = scale(toCell(marker.z)) - marker.size / 2;
          const dot = (
            <View
              style={{
                width: marker.size,
                height: marker.size,
                borderRadius: marker.size / 2,
                backgroundColor: marker.color,
                borderWidth: chosen === marker.label ? 2 : 1,
                borderColor: chosen === marker.label ? theme.color.text : 'rgba(0,0,0,0.45)',
              }}
            />
          );
          if (!marker.target) {
            return <View key={marker.key} style={[styles.marker, { left, top }]}>{dot}</View>;
          }
          return (
            <Pressable
              key={marker.key}
              onPress={() => choose(marker)}
              // Het trefvlak is groter dan de stip: een marker van elf punten
              // is niet te raken met een duim.
              hitSlop={12}
              style={[styles.marker, { left, top }]}
            >
              {dot}
            </Pressable>
          );
        })}

        {/* Jezelf, als laatste zodat je altijd bovenop ligt. */}
        <View
          style={[
            styles.marker,
            { left: scale(toCell(me.x)) - 9, top: scale(toCell(me.z)) - 9 },
          ]}
          pointerEvents="none"
        >
          <Text
            style={[
              styles.player,
              // "➤" wijst naar rechts; deze hoek draait hem naar de kant waar
              // je kijkt, met de kaart naar het noorden gericht.
              { transform: [{ rotate: `${Math.atan2(Math.cos(me.yaw), Math.sin(me.yaw))}rad` }] },
            ]}
          >
            ➤
          </Text>
        </View>
      </Pressable>

      <Text style={styles.here}>
        Je staat in {district.name}
        {shop ? ` · ${shop.spot.name} op ${Math.round(shop.distance)} m` : ''}
      </Text>
      {mapTeleport ? (
        <Text style={styles.here}>Tik ergens op de kaart om erheen te springen.</Text>
      ) : null}
      <Text style={styles.legend}>
        🟡 pandjeshuis · 🔵 andere speler · gekleurde stipjes zijn items die om je heen liggen
      </Text>

      {chosen ? (
        <>
          <View style={{ height: 10 }} />
          <Button
            label={`Bestemming wissen (${chosen})`}
            tone="ghost"
            onPress={() => {
              navigationTarget.current = null;
              setChosen(null);
            }}
          />
        </>
      ) : (
        <Text style={styles.legend}>Tik een pandjeshuis of speler aan om ernaartoe te navigeren.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    width: SIZE,
    height: SIZE,
    alignSelf: 'center',
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    backgroundColor: '#0a1622',
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  marker: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  player: { color: theme.color.accent, fontSize: 17 },
  here: { color: theme.color.text, fontSize: 13, fontWeight: '700', marginTop: 12 },
  legend: { color: theme.color.textDim, fontSize: 11, marginTop: 6, lineHeight: 16 },
});
