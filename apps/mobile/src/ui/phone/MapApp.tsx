import { CITY, districtAtWorld, nearestShop, shopSpots } from '@game/shared';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as api from '../../net/api';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { remotePlayers } from '../../net/presence';
import {
  cameraState,
  navigationTarget,
  playerPosition,
  routeStore,
  setPlayerPosition,
  vernieuwRoute,
} from '../../state/position';
import { useGame } from '../../state/useGame';
import { useSettings } from '../../state/useSettings';
import { Button, Row } from '../components';
import { rarityColor, theme } from '../theme';

/**
 * De kaart van de stad.
 *
 * De kaart is één plaat, vooraf getekend uit dezelfde stadsdata als de
 * 3D-wereld (zie scripts/preview/citymap.ts). Hij kán dus niet afwijken van
 * waar je loopt. Daarvoor bestond hij uit elf gekleurde vakken en tien lijnen;
 * dat was een schema van de stad en geen plattegrond, en de lijnen liepen zelfs
 * over de zee en door het park heen.
 *
 * Waarom een plaat en geen tekening ter plekke: straten, bouwblokken en een
 * kustlijn zijn tienduizenden vormen, en die tekent een telefoon niet als losse
 * Views. De stad is deterministisch, dus een plaat ervan kan tijdens het spelen
 * niet verouderen — en een test bewaakt dat hij bij déze stad hoort.
 */

const KAART = require('../../../assets/stadskaart.png');
const STEMPEL = require('../../../assets/stadskaart.json') as {
  seed: number;
  gridSize: number;
  size: number;
};

/** Het venster waarin de kaart past, in punten. */
const VENSTER = 300;
/** Hoeveel de plaat op zichzelf staat: 1 = de hele stad past in het venster. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

/** Van wereldcoördinaat naar een punt op de plaat, bij zoom 1. */
const toMap = (world: number): number =>
  ((world / CITY.cellSize + CITY.originCell) / CITY.gridSize) * VENSTER;

/** En terug. */
const toWorld = (point: number): number =>
  ((point / VENSTER) * CITY.gridSize - CITY.originCell) * CITY.cellSize;

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
   * Dezelfde route als op straat, maar dan van bovenaf — letterlijk dezelfde.
   *
   * Hier stond een eigen `findRoute` in een `useMemo` op je positie, dus hij
   * rekende opnieuw zo vaak als de kaart hertekende. Nu leest hij wat de lijn in
   * de wereld heeft uitgerekend. Dat is niet alleen goedkoper: twee plekken die
   * hetzelfde uitrekenen kunnen uit elkaar gaan lopen, en dan wijst je telefoon
   * een andere kant op dan de lijn voor je voeten.
   */
  const route = routeStore.doel === chosen ? routeStore.current : null;

  // Normaal vult `RouteLijn` de store, en die draait zolang het stadsscherm
  // eronder staat. Open je de telefoon vanaf een ander scherm, dan is er geen
  // 3D-wereld en zou de kaart geen lijn tonen. Dan rekent de kaart hem zelf uit
  // — met dezelfde functie en in dezelfde store, dus het blijft één route en
  // niet twee die uit elkaar kunnen lopen. Eén keer per keuze, in een effect en
  // niet in de tekening.
  useEffect(() => {
    const doel = navigationTarget.current;
    if (!doel || routeStore.doel === doel.label) return;
    vernieuwRoute(doel);
  }, [chosen]);

  // ---------------------------------------------------------------------
  // Knijpen, slepen en zoomen.
  //
  // De laag wordt verschoven en geschaald; de markers zitten erin, dus die
  // gaan vanzelf mee. Reanimated houdt dat buiten React, want tijdens een
  // gebaar zou een hertekening per frame de kaart laten haperen.
  // ---------------------------------------------------------------------
  const zoom = useSharedValue(MIN_ZOOM);
  const schuifX = useSharedValue(0);
  const schuifZ = useSharedValue(0);
  const startZoom = useSharedValue(MIN_ZOOM);
  const startX = useSharedValue(0);
  const startZ = useSharedValue(0);

  const laagStijl = useAnimatedStyle(() => ({
    transform: [
      { translateX: schuifX.value },
      { translateY: schuifZ.value },
      { scale: zoom.value },
    ],
  }));

  /** Houdt de kaart binnen het venster, hoe ver je ook sleept. */
  const klem = (waarde: number, z: number): number => {
    'worklet';
    const speling = (VENSTER * (z - 1)) / 2;
    return Math.min(speling, Math.max(-speling, waarde));
  };

  const slepen = Gesture.Pan()
    .onBegin(() => {
      startX.value = schuifX.value;
      startZ.value = schuifZ.value;
    })
    .onUpdate((e) => {
      schuifX.value = klem(startX.value + e.translationX, zoom.value);
      schuifZ.value = klem(startZ.value + e.translationY, zoom.value);
    });

  const knijpen = Gesture.Pinch()
    .onBegin(() => {
      startZoom.value = zoom.value;
    })
    .onUpdate((e) => {
      zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, startZoom.value * e.scale));
      schuifX.value = klem(schuifX.value, zoom.value);
      schuifZ.value = klem(schuifZ.value, zoom.value);
    });

  const tikken = Gesture.Tap().onEnd((e) => {
    // Van schermpunt terug naar een punt op de plaat: eerst de verschuiving
    // eruit, dan de schaal. Dit is de omgekeerde weg van `laagStijl`.
    const midden = VENSTER / 2;
    const opPlaat = {
      x: (e.x - midden - schuifX.value) / zoom.value + midden,
      z: (e.y - midden - schuifZ.value) / zoom.value + midden,
    };
    if (mapTeleport) tapToJump(opPlaat.x, opPlaat.z);
  });

  const gebaren = Gesture.Simultaneous(slepen, knijpen, tikken);

  const zoomNaarMij = (): void => {
    const doel = 3;
    zoom.value = withTiming(doel);
    schuifX.value = withTiming(klem((VENSTER / 2 - toMap(me.x)) * doel, doel));
    schuifZ.value = withTiming(klem((VENSTER / 2 - toMap(me.z)) * doel, doel));
  };

  const zoomUit = (): void => {
    zoom.value = withTiming(MIN_ZOOM);
    schuifX.value = withTiming(0);
    schuifZ.value = withTiming(0);
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
      <GestureDetector gesture={gebaren}>
        <View style={styles.venster}>
          {/*
            Alles wat op de kaart hoort zit in één meebewegende laag: de plaat
            én de markers. Zouden de markers erbuiten staan, dan bleven ze
            hangen zodra je zoomt of sleept.
          */}
          <Animated.View style={[styles.laag, laagStijl]}>
            <Image source={KAART} style={styles.plaat} resizeMode="contain" />

            {route?.punten.slice(1).map((punt, i) => {
              const vorige = route.punten[i]!;
              const x1 = toMap(vorige.x);
              const z1 = toMap(vorige.z);
              const x2 = toMap(punt.x);
              const z2 = toMap(punt.z);
              const lengte = Math.hypot(x2 - x1, z2 - z1);
              return (
                <View
                  key={`route-${i}`}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: x1,
                    top: z1 - 1,
                    width: lengte,
                    height: 2,
                    backgroundColor: route.bereikbaar ? theme.color.accent : '#e0704e',
                    transform: [
                      { translateX: -lengte / 2 },
                      { rotate: `${Math.atan2(z2 - z1, x2 - x1)}rad` },
                      { translateX: lengte / 2 },
                    ],
                  }}
                />
              );
            })}

        {markers.map((marker) => {
          const left = toMap(marker.x) - marker.size / 2;
          const top = toMap(marker.z) - marker.size / 2;
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
          style={[styles.marker, { left: toMap(me.x) - 9, top: toMap(me.z) - 9 }]}
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
          </Animated.View>
        </View>
      </GestureDetector>

      <Row style={{ gap: 8, marginTop: 10 }}>
        <Button label="Op mij" tone="ghost" compact onPress={() => zoomNaarMij()} />
        <Button label="Hele stad" tone="ghost" compact onPress={() => zoomUit()} />
      </Row>

      <Text style={styles.here}>
        Je staat in {district.name}
        {shop ? ` · ${shop.spot.name} op ${Math.round(shop.distance)} m` : ''}
      </Text>
      {mapTeleport ? (
        <Text style={styles.here}>Tik ergens op de kaart om erheen te springen.</Text>
      ) : null}
      {route ? (
        <Text style={styles.here}>
          {route.bereikbaar
            ? `Route: ${Math.round(route.lengte)} m lopen`
            : 'Daar is geen looproute naartoe — dat gaat alleen per boot.'}
        </Text>
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
  venster: {
    width: VENSTER,
    height: VENSTER,
    alignSelf: 'center',
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    backgroundColor: '#12293a',
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  laag: { width: VENSTER, height: VENSTER },
  plaat: { width: VENSTER, height: VENSTER },
  marker: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  player: { color: theme.color.accent, fontSize: 17 },
  here: { color: theme.color.text, fontSize: 13, fontWeight: '700', marginTop: 12 },
  legend: { color: theme.color.textDim, fontSize: 11, marginTop: 6, lineHeight: 16 },
});
