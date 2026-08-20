import {
  PLACEMENT_PROBLEM_MESSAGE,
  checkPlacement,
  floorPlanFor,
  formatMoney,
  getItem,
  isPlaceable,
} from '@game/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BaseScene, homeCameraState } from '../../src/game3d/BaseScene';
import { homeFocus } from '../../src/state/homePosition';
import { useGame } from '../../src/state/useGame';
import { Button, Row } from '../../src/ui/components';
import { Joystick } from '../../src/ui/Controls';
import { rarityColor, theme } from '../../src/ui/theme';

/**
 * Je woning van binnen — je loopt er zelf doorheen.
 *
 * Het was een poppenhuis: een camera die eromheen draaide en vakjes waar je van
 * bovenaf op tikte. Dat werkte, maar het maakte van je woning een formulier.
 * Nu loop je naar een plek toe en zet je daar iets neer, en dat is precies wat
 * een gevonden bank de moeite waard maakt.
 *
 * Alles draait om het vakje voor je neus: dat licht op, en de knoppen eronder
 * gaan over dát vakje. Geen cursor die je apart moet verplaatsen.
 */
export default function InteriorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const state = useGame((s) => s.state);
  const busy = useGame((s) => s.busy);
  const place = useGame((s) => s.place);
  const moveItem = useGame((s) => s.moveItem);
  const storeItem = useGame((s) => s.storeItem);
  const swapItem = useGame((s) => s.swapItem);

  // Kom je hier vanaf het base-scherm omdat je iets wilde neerzetten, dan houd
  // je dat meteen vast — anders moet je het nog eens uit je rugzak vissen.
  const { pak } = useLocalSearchParams<{ pak?: string }>();
  /** Wat je vasthoudt om neer te zetten. */
  const [holding, setHolding] = useState<string | null>(pak ?? null);
  const [rotation, setRotation] = useState(0);
  const [trayOpen, setTrayOpen] = useState(false);

  /**
   * Waar je naar kijkt. De 3D-laag schrijft dit elke frame; hier lezen we het
   * vijf keer per seconde. Vaker zou de hele onderbalk zestig keer per seconde
   * hertekenen voor een getal dat je toch niet zo snel kunt lezen.
   */
  const [focus, setFocus] = useState<{ cell: { x: number; z: number } | null; placementId: string | null }>({
    cell: null,
    placementId: null,
  });
  useEffect(() => {
    const timer = setInterval(() => {
      setFocus({ cell: homeFocus.cell, placementId: homeFocus.placementId });
    }, 200);
    return () => clearInterval(timer);
  }, []);

  const startYaw = useRef(homeCameraState.yaw);
  const look = Gesture.Pan()
    .runOnJS(true)
    .minDistance(10)
    .onBegin(() => {
      startYaw.current = homeCameraState.yaw;
    })
    .onUpdate((event) => {
      homeCameraState.yaw = startYaw.current - event.translationX * 0.006;
    });

  const plan = useMemo(
    () => floorPlanFor(state?.player.propertyId ?? 'squat'),
    [state?.player.propertyId],
  );

  if (!state) return null;
  const placements = state.placements;
  const inTray = state.inventory.filter((entry) => isPlaceable(getItem(entry.itemId)));

  /** Het voorwerp waar je voor staat. */
  const facing = placements.find((placed) => placed.id === focus.placementId) ?? null;
  /** Wat er straks op dat vakje komt: wat je vasthoudt, of wat je oppakt om te verzetten. */
  const subject = holding ?? facing?.itemId ?? null;

  const check =
    subject && focus.cell
      ? checkPlacement(
          plan,
          placements,
          subject,
          focus.cell.x,
          focus.cell.z,
          rotation,
          // Verplaats je iets, dan mag het zichzelf niet in de weg zitten.
          holding ? undefined : facing?.id,
        )
      : null;
  const fits = check?.ok === true;

  /** Sta je voor iets én houd je iets vast, dan is wisselen de bedoeling. */
  const canSwap = Boolean(holding && facing && holding !== facing.itemId);

  const reset = (): void => {
    setHolding(null);
    setRotation(0);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Row style={{ alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Thuis</Text>
            <Text style={styles.dim}>
              {placements.length}/{state.stats.slots} plekken ·{' '}
              {Math.round(state.stats.decorationBonus * 100)}% inrichtingsbonus ·{' '}
              {formatMoney(state.stats.incomePerHour)}/u
            </Text>
          </View>
          <Button label="Naar buiten" tone="ghost" compact onPress={() => router.back()} />
        </Row>
      </View>

      <GestureDetector gesture={look}>
        <View style={styles.canvas}>
          <BaseScene
            plan={plan}
            placements={placements}
            selectedId={facing?.id ?? null}
            highlight={focus.cell}
            highlightValid={fits || canSwap}
            ghost={holding && focus.cell ? { itemId: holding, rotation } : null}
          />
          <Joystick />
        </View>
      </GestureDetector>

      {/* Wat je hier kunt doen. Altijd over het vakje voor je neus. */}
      <View style={styles.panel}>
        {holding ? (
          <>
            <Text style={styles.panelTitle}>
              {getItem(holding).icon} {getItem(holding).name} in je handen
            </Text>
            <Text style={[styles.dim, !fits && !canSwap && { color: theme.color.danger }]}>
              {canSwap
                ? `Wisselen met ${getItem(facing!.itemId).name}`
                : fits
                  ? 'Hier is plek'
                  : check && !check.ok
                    ? PLACEMENT_PROBLEM_MESSAGE[check.problem]
                    : 'Loop naar een vrij vak'}
            </Text>
            <Row style={{ marginTop: 8 }}>
              <Button
                label="Draaien"
                compact
                tone="ghost"
                onPress={() => setRotation((r) => (r + 1) % 4)}
              />
              <Button label="Leggen laten" compact tone="ghost" onPress={reset} />
              <View style={{ flex: 1 }} />
              {canSwap ? (
                <Button
                  label="Wisselen"
                  compact
                  loading={busy}
                  onPress={async () => {
                    if (await swapItem(facing!.id, holding)) reset();
                  }}
                />
              ) : (
                <Button
                  label="Zet neer"
                  compact
                  disabled={!fits}
                  loading={busy}
                  onPress={async () => {
                    if (!focus.cell) return;
                    if (await place(holding, { ...focus.cell, rotation })) reset();
                  }}
                />
              )}
            </Row>
          </>
        ) : facing ? (
          <>
            <Text style={styles.panelTitle}>
              {getItem(facing.itemId).icon} {getItem(facing.itemId).name}
            </Text>
            <Text style={styles.dim}>
              {formatMoney(getItem(facing.itemId).incomePerHour ?? 0)}/u ·{' '}
              {getItem(facing.itemId).flex ?? 0} flex
            </Text>
            <Row style={{ marginTop: 8 }}>
              <Button
                label="Draaien"
                compact
                tone="ghost"
                loading={busy}
                onPress={() =>
                  void moveItem(facing.id, facing.x, facing.z, (facing.rotation + 1) % 4)
                }
              />
              <View style={{ flex: 1 }} />
              <Button
                label="Oppakken"
                compact
                loading={busy}
                onPress={() => void storeItem(facing.id)}
              />
            </Row>
          </>
        ) : (
          <Text style={styles.dim}>
            Loop met de joystick, veeg om je heen te kijken. Ga voor een leeg vak staan en pak iets
            uit je rugzak om het daar neer te zetten. Sta je voor iets dat er al staat, dan kun je
            het draaien of oppakken.
          </Text>
        )}
      </View>

      {/* Je rugzak, ingeklapt tot je hem nodig hebt. */}
      <View style={[styles.tray, { paddingBottom: insets.bottom + 8 }]}>
        <Pressable onPress={() => setTrayOpen((open) => !open)} style={styles.trayHeader}>
          <Text style={styles.trayLabel}>
            🎒 In je rugzak ({inTray.reduce((sum, entry) => sum + entry.quantity, 0)})
          </Text>
          <Text style={styles.trayChevron}>{trayOpen ? '▾' : '▴'}</Text>
        </Pressable>

        {trayOpen ? (
          inTray.length === 0 ? (
            <Text style={styles.dim}>
              Niets om neer te zetten. Zoek meubels in de stad of maak ze bij de Werkbank.
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {inTray.map((entry) => {
                const item = getItem(entry.itemId);
                const active = holding === entry.itemId;
                return (
                  <Pressable
                    key={entry.itemId}
                    onPress={() => {
                      setHolding(active ? null : entry.itemId);
                      setRotation(0);
                    }}
                    style={[
                      styles.trayItem,
                      { borderColor: active ? theme.color.accent : theme.color.border },
                    ]}
                  >
                    <Text style={styles.trayIcon}>{item.icon}</Text>
                    <Text
                      style={[styles.trayName, { color: rarityColor[item.rarity] }]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    <Text style={styles.dim}>
                      {entry.quantity}x · {formatMoney(item.incomePerHour ?? 0)}/u
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  header: { paddingHorizontal: 14, paddingBottom: 8 },
  title: { color: theme.color.text, fontSize: 22, fontWeight: '800' },
  dim: { color: theme.color.textDim, fontSize: 12, marginTop: 2, lineHeight: 17 },
  canvas: { flex: 1, backgroundColor: theme.color.bg },
  panel: {
    backgroundColor: theme.color.panelSolid,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
    padding: 12,
    minHeight: 96,
  },
  panelTitle: { color: theme.color.text, fontSize: 16, fontWeight: '700' },
  tray: {
    backgroundColor: theme.color.bgSoft,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  trayHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6 },
  trayLabel: { color: theme.color.textDim, fontSize: 12, fontWeight: '800', flex: 1 },
  trayChevron: { color: theme.color.textDim, fontSize: 13, fontWeight: '800' },
  trayItem: {
    width: 104,
    marginRight: 8,
    padding: 8,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    backgroundColor: theme.color.panel,
  },
  trayIcon: { fontSize: 22 },
  trayName: { fontSize: 12, fontWeight: '700', marginTop: 2 },
});
