import {
  BOOSTS_BY_ID,
  DOOR_REACH,
  SHOP_REACH,
  districtAtWorld,
  findRoute,
  formatDuration,
  formatMoney,
  getVehicle,
  formatMoney as money,
  getProperty,
  nearestShop,
  relevantAddresses,
  toKmh,
} from '@game/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onCrowdChange, realtime } from '../net/presence';
import { renderStats } from '../state/devWorld';
import { cameraState, driveState, flyInput, navigationTarget, playerPosition } from '../state/position';
import { driving, useDriving } from '../state/useDriving';
import { useSettings } from '../state/useSettings';
import { useGame } from '../state/useGame';
import { Bar, Button } from './components';
import { ShopSheet } from './ShopSheet';
import { rarityColor, theme } from './theme';
import { useLiveVault } from './useLiveVault';

/** Waar sta ik, en hoeveel ligt er om me heen? Elke seconde bijgewerkt. */
function useSurroundings() {
  const spawns = useGame((s) => s.spawns);
  const [info, setInfo] = useState(() => ({
    district: districtAtWorld(playerPosition.x, playerPosition.z).name,
    nearby: 0,
  }));

  useEffect(() => {
    const update = () => {
      const district = districtAtWorld(playerPosition.x, playerPosition.z);
      let nearby = 0;
      for (const spawn of spawns) {
        if (Math.hypot(spawn.x - playerPosition.x, spawn.z - playerPosition.z) < 60) nearby++;
      }
      setInfo({ district: district.name, nearby });
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [spawns]);

  return info;
}

/**
 * Wie er nog meer in de buurt lopen.
 *
 * Ook nul is informatie: dan weet je dat de verbinding staat en dat je alleen
 * bent, in plaats van je af te vragen of het wel werkt.
 */
function Crowd() {
  const [nearby, setNearby] = useState(0);
  const [connected, setConnected] = useState(realtime.connected);

  useEffect(() => {
    const stop = onCrowdChange(setNearby);
    const timer = setInterval(() => setConnected(realtime.connected), 1000);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, []);

  return (
    <View style={styles.chip}>
      <Text style={[styles.chipValue, !connected && { color: theme.color.textDim }]}>
        {connected ? `👥 ${nearby}` : '👥 –'}
      </Text>
    </View>
  );
}

/**
 * Snelheidsmeter.
 *
 * De snelheid verandert elke frame, maar hem elke frame in React zetten zou
 * de hele HUD zestig keer per seconde hertekenen. Vijf keer per seconde is
 * ruim genoeg om een teller te laten meelopen.
 */
function Speedometer() {
  const [kmh, setKmh] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setKmh(toKmh(driveState.speed)), 200);
    return () => clearInterval(timer);
  }, []);
  return (
    <View style={styles.speedo} pointerEvents="none">
      <Text style={styles.speedoValue}>{kmh}</Text>
      <Text style={styles.speedoUnit}>km/u</Text>
    </View>
  );
}

/**
 * Stijgen en dalen in de vliegmodus. Alleen zichtbaar als die aan staat.
 *
 * De knoppen schrijven rechtstreeks in `flyInput`; er gaat niets via React,
 * want dit verandert zestig keer per seconde zolang je hem ingedrukt houdt.
 */
function FlyControls({ bottom }: { bottom: number }) {
  return (
    <View style={[styles.flyColumn, { bottom }]}>
      {([
        ['▲', 1],
        ['▼', -1],
      ] as const).map(([label, direction]) => (
        <Pressable
          key={label}
          onPressIn={() => {
            flyInput.climb = direction;
          }}
          onPressOut={() => {
            flyInput.climb = 0;
          }}
          style={({ pressed }) => [styles.flyButton, pressed && styles.flyButtonActive]}
        >
          <Text style={styles.flyLabel}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Sta je bij een pandjeshuis, en waar is de dichtstbijzijnde?
 *
 * Vier keer per seconde. Je loopt hooguit een paar meter per tel, dus vaker
 * peilen levert niets op behalve hertekeningen van de hele HUD.
 */
function useShop() {
  const [near, setNear] = useState(() => nearestShop(playerPosition.x, playerPosition.z));

  useEffect(() => {
    const timer = setInterval(() => {
      setNear(nearestShop(playerPosition.x, playerPosition.z));
    }, 250);
    return () => clearInterval(timer);
  }, []);

  return { near, atShop: near !== null && near.distance <= SHOP_REACH };
}

/**
 * Sta je voor een voordeur — je eigen, of een pand dat te koop staat?
 *
 * Zelfde ritme als de winkelpeiling: vier keer per seconde is ruim genoeg om
 * een knop te laten verschijnen, en het scheelt de HUD een hertekening per
 * frame.
 */
function useDoor(propertyId: string | undefined, seed: number | undefined) {
  const [door, setDoor] = useState<{ propertyId: string; owned: boolean; street: string } | null>(
    null,
  );

  useEffect(() => {
    if (!propertyId || seed === undefined) return;
    const timer = setInterval(() => {
      let best: { propertyId: string; owned: boolean; street: string; distance: number } | null =
        null;
      for (const entry of relevantAddresses(propertyId, seed)) {
        const distance = Math.hypot(
          entry.address.x - playerPosition.x,
          entry.address.z - playerPosition.z,
        );
        if (distance > DOOR_REACH) continue;
        if (!best || distance < best.distance) {
          best = {
            propertyId: entry.address.propertyId,
            owned: entry.owned,
            street: entry.address.street,
            distance,
          };
        }
      }
      setDoor(best ? { propertyId: best.propertyId, owned: best.owned, street: best.street } : null);
    }, 250);
    return () => clearInterval(timer);
  }, [propertyId, seed]);

  return door;
}

/**
 * De navigatiewijzer: een pijl naar je bestemming, met de afstand erbij.
 *
 * De pijl draait mee met de camera, want "die kant op" heeft alleen betekenis
 * ten opzichte van waar je kijkt. Dit is bewust één wijzer met een instelbaar
 * doel en niet een winkelpijl: straks kan de kaart er ook een bestemming in
 * zetten, en twee pijlen op één scherm is geen navigatie meer.
 */
function Compass({ bottom }: { bottom: number }) {
  const [state, setState] = useState<{
    label: string;
    distance: number;
    angle: number;
    /** Lengte van de looproute, of null als er geen route is. */
    route: number | null;
  } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      const target = navigationTarget.current;
      if (!target) {
        setState(null);
        return;
      }
      const dx = target.x - playerPosition.x;
      const dz = target.z - playerPosition.z;
      // Vier keer per seconde een route zoeken zou zonde zijn; de lijn in de
      // wereld rekent hem toch al uit. Hier alleen kijken óf hij bestaat, en
      // dat verandert pas als je een andere bestemming kiest.
      const route = findRoute({ x: playerPosition.x, z: playerPosition.z }, target);
      setState({
        label: target.label,
        distance: Math.hypot(dx, dz),
        // atan2 geeft de richting in de wereld; de camerahoek eraf haalt het
        // om naar "links of rechts van waar je kijkt".
        angle: Math.atan2(dx, dz) - cameraState.yaw,
        route: route.bereikbaar ? route.lengte : null,
      });
    }, 250);
    return () => clearInterval(timer);
  }, []);

  if (!state) return null;
  return (
    <View style={[styles.compass, { bottom }]} pointerEvents="none">
      {/*
        De pijl is terugval geworden. Ligt er een looproute, dan zie je die als
        lijn op straat en wijst een pijl je alleen maar dwars door een gevel;
        dan blijft alleen de afstand staan. Kun je er niet lópen — het
        privé-eiland ligt in zee — dan is een richting het enige dat er is, en
        dan hoort de pijl er juist wél te staan.
      */}
      {state.route ? null : (
        <Text style={[styles.compassArrow, { transform: [{ rotate: `${-state.angle}rad` }] }]}>
          ➤
        </Text>
      )}
      <View>
        <Text style={styles.compassLabel} numberOfLines={1}>
          {state.label}
        </Text>
        <Text style={styles.compassDistance}>
          {state.route
            ? `${Math.round(state.route)} m volg de lijn`
            : `${Math.round(state.distance)} m hemelsbreed`}
        </Text>
      </View>
    </View>
  );
}

/**
 * De meter uit het testgereedschap: hoe zwaar is dit beeld, en waar sta ik?
 *
 * Twee keer per seconde. Vaker heeft geen zin — je leest het toch niet — en
 * elke keer is een hertekening van de HUD.
 */
function DebugPanel({ top }: { top: number }) {
  const [snapshot, setSnapshot] = useState(() => ({ ...renderStats, x: 0, z: 0 }));

  useEffect(() => {
    const timer = setInterval(() => {
      setSnapshot({ ...renderStats, x: playerPosition.x, z: playerPosition.z });
    }, 500);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={[styles.debugPanel, { top }]} pointerEvents="none">
      <Text style={styles.debugText}>{Math.round(snapshot.fps)} fps</Text>
      <Text style={styles.debugText}>
        {snapshot.calls} calls · {Math.round(snapshot.triangles / 1000)}k tri
      </Text>
      <Text style={styles.debugText}>{snapshot.programs} shaders</Text>
      <Text style={styles.debugText}>
        x {Math.round(snapshot.x)} · z {Math.round(snapshot.z)}
      </Text>
    </View>
  );
}

/** In- en uitstappen. Alleen zichtbaar als je iets hebt om in te stappen. */
function DriveButton({ vehicleId, bottom }: { vehicleId: string; bottom: number }) {
  const active = useDriving((s) => s.active);
  const vehicle = getVehicle(vehicleId);
  if (!vehicle.drivable) return null;

  return (
    <Pressable
      onPress={() => (active ? driving.exit() : driving.enter(vehicleId))}
      style={({ pressed }) => [
        styles.driveButton,
        { bottom },
        active && styles.driveButtonActive,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={styles.driveIcon}>{active ? '🚶' : vehicle.icon}</Text>
      <Text style={styles.driveLabel}>{active ? 'Uitstappen' : 'Instappen'}</Text>
    </Pressable>
  );
}

export function HUD() {
  const insets = useSafeAreaInsets();
  const state = useGame((s) => s.state);
  const busy = useGame((s) => s.busy);
  const claimVault = useGame((s) => s.claimVault);
  const toasts = useGame((s) => s.toasts);
  const vault = useLiveVault();
  const surroundings = useSurroundings();
  const clockOffset = useGame((s) => s.clockOffset);
  const isDriving = useDriving((s) => s.active);
  const flying = useSettings((s) => s.fly);
  const walkBoost = useSettings((s) => s.walkBoost);
  const debugOverlay = useSettings((s) => s.debugOverlay);
  const { near: shop, atShop } = useShop();
  const [shopOpen, setShopOpen] = useState(false);
  const router = useRouter();
  const door = useDoor(state?.player.propertyId, state?.player.seed);
  const buyProperty = useGame((s) => s.buyProperty);

  const carriedNow = state
    ? state.inventory.reduce((sum, entry) => sum + entry.quantity, 0)
    : 0;
  const nearlyFull = state ? carriedNow >= state.stats.inventorySlots * 0.8 : false;

  // Zit je rugzak bijna vol, dan wijst de wijzer vanzelf naar de winkel — dat
  // is precies wanneer je hem nodig hebt. Staat er al een bestemming van de
  // speler zelf, dan blijft die staan.
  useEffect(() => {
    if (nearlyFull && shop) {
      if (!navigationTarget.current || navigationTarget.current.label === shop.spot.name) {
        navigationTarget.current = { x: shop.spot.x, z: shop.spot.z, label: shop.spot.name };
      }
    } else if (shop && navigationTarget.current?.label === shop.spot.name) {
      navigationTarget.current = null;
    }
  }, [nearlyFull, shop]);

  if (!state) return null;
  const { player, stats } = state;
  const carried = carriedNow;
  const vaultBalance = vault?.vaultBalance ?? state.vault.balance;
  const vaultFull = !stats.autoCollect && vaultBalance >= stats.vaultCapacity;

  return (
    <View style={[styles.overlay, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
      {/* Bovenbalk: geld, gems en level */}
      <View style={styles.topBar} pointerEvents="none">
        <View style={styles.chip}>
          <Text style={[styles.chipValue, { color: theme.color.cash }]}>
            {formatMoney(player.cash)}
          </Text>
        </View>
        <View style={styles.chip}>
          <Text style={[styles.chipValue, { color: theme.color.gems }]}>💎 {player.gems}</Text>
        </View>
        <Crowd />
        <View style={[styles.chip, styles.levelChip]}>
          <Text style={styles.chipLabel}>lvl {player.level}</Text>
          <Bar
            value={player.xpIntoLevel}
            max={player.xpForNext}
            color={theme.color.xp}
            height={5}
          />
        </View>
      </View>

      {/* Waar ben ik en hoeveel ligt er */}
      <View style={styles.locationRow} pointerEvents="none">
        <Text style={styles.district}>{surroundings.district}</Text>
        <Text style={styles.nearby}>
          {surroundings.nearby > 0 ? `${surroundings.nearby} items in de buurt` : 'niets in de buurt'}
        </Text>
      </View>

      {/* Lopende boosts */}
      {state.activeBoosts.length > 0 ? (
        <View style={styles.boostRow} pointerEvents="none">
          {state.activeBoosts.map((active) => {
            const def = BOOSTS_BY_ID[active.boostId];
            const remaining = (active.expiresAt - (Date.now() + clockOffset)) / 1000;
            return (
              <View key={active.boostId} style={styles.boostPill}>
                <Text style={styles.boostText}>
                  {def?.icon ?? '⚡'} {formatDuration(remaining)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Kluis */}
      <View style={styles.vaultCard}>
        <Text style={styles.vaultLabel}>{stats.autoCollect ? 'MANAGER' : 'KLUIS'}</Text>
        <Text style={[styles.vaultValue, vaultFull && { color: theme.color.danger }]}>
          {formatMoney(vaultBalance)}
        </Text>
        {stats.autoCollect ? null : (
          <Bar
            value={vaultBalance}
            max={stats.vaultCapacity}
            color={vaultFull ? theme.color.danger : theme.color.accent}
            height={6}
          />
        )}
        <Text style={styles.vaultHint}>
          {formatMoney(stats.incomePerHour)}/u ·{' '}
          {stats.autoCollect
            ? `automatisch, -${Math.round(stats.managerFee * 100)}%`
            : vaultFull
              ? 'vol!'
              : vault && Number.isFinite(vault.secondsUntilFull)
                ? `vol over ${formatDuration(vault.secondsUntilFull)}`
                : `max ${formatMoney(stats.vaultCapacity)}`}
        </Text>
        {stats.autoCollect ? null : (
          <Button
            label="Legen"
            compact
            onPress={() => void claimVault()}
            disabled={vaultBalance < 1}
            loading={busy}
          />
        )}
      </View>

      {/* Parkbuit: gevonden, maar nog niet veilig. */}
      {state.parkLoot.length > 0 ? (
        <View style={[styles.parkPouch, { bottom: insets.bottom + 272 }]} pointerEvents="none">
          <Text style={styles.parkPouchText}>
            🌿 {state.parkLoot.reduce((sum, entry) => sum + entry.quantity, 0)} nog niet veilig
          </Text>
        </View>
      ) : null}

      {/* Rugzak */}
      <View style={[styles.backpack, { bottom: insets.bottom + 200 }]} pointerEvents="none">
        <Text style={[styles.backpackText, nearlyFull && { color: theme.color.danger }]}>
          🎒 {carried}/{stats.inventorySlots}
        </Text>
      </View>

      {/* Pandjeshuis: alleen als je ervoor staat. */}
      {atShop && shop ? (
        <Pressable
          onPress={() => setShopOpen(true)}
          style={({ pressed }) => [
            styles.shopButton,
            { bottom: insets.bottom + 240 },
            pressed && { opacity: 0.75 },
          ]}
        >
          <Text style={styles.shopIcon}>🏷️</Text>
          <Text style={styles.shopLabel}>Verkopen</Text>
        </Pressable>
      ) : null}
      {shopOpen && shop ? (
        <ShopSheet name={shop.spot.name} onClose={() => setShopOpen(false)} />
      ) : null}

      {/* Voordeur: naar binnen bij je eigen huis, kopen bij een pand met een bord. */}
      {door && !atShop ? (
        <Pressable
          onPress={() => {
            if (door.owned) {
              router.push('/(game)/interior');
              return;
            }
            const target = getProperty(door.propertyId);
            Alert.alert(
              `${target.name} kopen?`,
              `${money(target.price)} · ${door.street}\n\nJe verhuist met je spullen mee; je oude woning komt leeg te staan.`,
              [
                { text: 'Nog even niet', style: 'cancel' },
                { text: 'Kopen', onPress: () => void buyProperty(door.propertyId) },
              ],
            );
          }}
          style={({ pressed }) => [
            styles.shopButton,
            { bottom: insets.bottom + 240 },
            !door.owned && { backgroundColor: theme.color.cash },
            pressed && { opacity: 0.75 },
          ]}
        >
          <Text style={styles.shopIcon}>{door.owned ? '🚪' : '🏷️'}</Text>
          <Text style={styles.shopLabel}>
            {door.owned ? 'Naar binnen' : `Kopen · ${money(getProperty(door.propertyId).price)}`}
          </Text>
        </Pressable>
      ) : null}

      {/* Voertuig */}
      {flying ? null : <DriveButton vehicleId={player.vehicleId} bottom={insets.bottom + 148} />}
      {isDriving ? <Speedometer /> : null}
      {flying ? <FlyControls bottom={insets.bottom + 120} /> : null}
      {flying || walkBoost > 1 ? (
        <View style={[styles.devBadge, { bottom: insets.bottom + 258 }]} pointerEvents="none">
          <Text style={styles.devBadgeText}>
            {flying ? '🛩️ vliegmodus' : ''}
            {flying && walkBoost > 1 ? ' · ' : ''}
            {walkBoost > 1 ? `${walkBoost}× snelheid` : ''}
          </Text>
        </View>
      ) : null}

      <Compass bottom={insets.bottom + 300} />
      {debugOverlay ? <DebugPanel top={insets.top + 120} /> : null}

      {/* Meldingen */}
      <View style={[styles.toasts, { bottom: insets.bottom + 250 }]} pointerEvents="none">
        {toasts.map((toast) => (
          <View
            key={toast.id}
            style={[
              styles.toast,
              { borderLeftColor: rarityColor[toast.color ?? ''] ?? theme.color.accent },
            ]}
          >
            <Text style={styles.toastText}>{toast.text}</Text>
            {toast.detail ? <Text style={styles.toastDetail}>{toast.detail}</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flyColumn: {
    position: 'absolute',
    right: 16,
    gap: 8,
  },
  flyButton: {
    width: 56,
    height: 46,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.panel,
    borderWidth: 1,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flyButtonActive: {
    borderColor: theme.color.accent,
    backgroundColor: 'rgba(77, 212, 172, 0.20)',
  },
  flyLabel: { color: theme.color.text, fontSize: 18, fontWeight: '700' },
  devBadge: {
    position: 'absolute',
    left: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(139, 125, 255, 0.22)',
    borderWidth: 1,
    borderColor: theme.color.xp,
  },
  devBadgeText: { color: theme.color.text, fontSize: 11, fontWeight: '700' },
  debugPanel: {
    position: 'absolute',
    left: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(6, 10, 22, 0.72)',
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  debugText: {
    color: theme.color.textDim,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  driveButton: {
    position: 'absolute',
    right: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.panel,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  driveButtonActive: {
    borderColor: theme.color.accent,
    backgroundColor: 'rgba(77, 212, 172, 0.18)',
  },
  driveIcon: { fontSize: 22 },
  driveLabel: { color: theme.color.text, fontSize: 11, fontWeight: '700', marginTop: 2 },
  speedo: {
    position: 'absolute',
    right: 18,
    bottom: 44,
    alignItems: 'flex-end',
  },
  speedoValue: {
    color: theme.color.text,
    fontSize: 34,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  speedoUnit: { color: theme.color.textDim, fontSize: 11, marginTop: -4, letterSpacing: 1 },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  topBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    backgroundColor: theme.color.panel,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  levelChip: { flex: 1, gap: 4, paddingVertical: 5 },
  chipValue: { fontWeight: '800', fontSize: 14 },
  chipLabel: { color: theme.color.textDim, fontSize: 11, fontWeight: '700' },
  locationRow: { paddingHorizontal: 16, paddingTop: 10 },
  district: { color: theme.color.text, fontSize: 20, fontWeight: '800' },
  nearby: { color: theme.color.textDim, fontSize: 12, marginTop: 2 },
  boostRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 8 },
  boostPill: {
    backgroundColor: theme.color.panel,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.accentDim,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  boostText: { color: theme.color.text, fontSize: 12, fontWeight: '700' },
  vaultCard: {
    position: 'absolute',
    right: 12,
    top: 140,
    width: 148,
    backgroundColor: theme.color.panel,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    padding: 10,
    gap: 6,
  },
  vaultLabel: { color: theme.color.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  vaultValue: { color: theme.color.cash, fontSize: 22, fontWeight: '800' },
  vaultHint: { color: theme.color.textDim, fontSize: 11 },
  backpack: {
    position: 'absolute',
    left: 20,
    backgroundColor: theme.color.panel,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  backpackText: { color: theme.color.text, fontWeight: '700', fontSize: 13 },
  shopButton: {
    position: 'absolute',
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.accent,
  },
  parkPouch: {
    position: 'absolute',
    left: 16,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(63, 107, 51, 0.32)',
    borderWidth: 1,
    borderColor: '#5f8f4a',
  },
  parkPouchText: { color: theme.color.text, fontSize: 12, fontWeight: '800' },
  shopIcon: { fontSize: 15 },
  shopLabel: { color: '#062018', fontWeight: '800', fontSize: 13 },
  compass: {
    position: 'absolute',
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.panel,
    borderWidth: 1,
    borderColor: theme.color.border,
    maxWidth: 210,
  },
  compassArrow: { color: theme.color.accent, fontSize: 17 },
  compassLabel: { color: theme.color.text, fontSize: 12, fontWeight: '700' },
  compassDistance: { color: theme.color.textDim, fontSize: 11, fontWeight: '700' },
  toasts: { position: 'absolute', left: 16, right: 16, gap: 6 },
  toast: {
    alignSelf: 'flex-start',
    backgroundColor: theme.color.panelSolid,
    borderRadius: theme.radius.sm,
    borderLeftWidth: 4,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  toastText: { color: theme.color.text, fontWeight: '700', fontSize: 14 },
  toastDetail: { color: theme.color.textDim, fontSize: 12 },
});
