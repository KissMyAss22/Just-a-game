import {
  PLACEMENT_PROBLEM_MESSAGE,
  checkPlacement,
  floorPlanFor,
  formatMoney,
  getItem,
  isPlaceable,
  rotatedFootprint,
} from '@game/shared';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BaseScene, homeCameraState, tapToCell } from '../../src/game3d/BaseScene';
import { useGame } from '../../src/state/useGame';
import { Button, Row } from '../../src/ui/components';
import { rarityColor, theme } from '../../src/ui/theme';

/**
 * Je woning inrichten.
 *
 * Op een telefoon is slepen in 3D onnauwkeurig, dus het gaat in twee stappen:
 * tik een vak aan om de cursor te verplaatsen, en bevestig daarna. Zo zet je
 * nooit per ongeluk iets op de verkeerde plek, en kun je van tevoren zien of
 * het past.
 */
export default function InteriorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const state = useGame((s) => s.state);
  const busy = useGame((s) => s.busy);
  const place = useGame((s) => s.place);
  const moveItem = useGame((s) => s.moveItem);
  const storeItem = useGame((s) => s.storeItem);

  const [cursor, setCursor] = useState<{ x: number; z: number } | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const startYaw = useRef(homeCameraState.yaw);

  const plan = useMemo(
    () => floorPlanFor(state?.player.propertyId ?? 'squat'),
    [state?.player.propertyId],
  );

  const placements = state?.placements ?? [];

  /** Wat staat er op deze cel? */
  const placementAt = (x: number, z: number) =>
    placements.find((placed) =>
      rotatedFootprintCells(placed).some((cell) => cell.x === x && cell.z === z),
    ) ?? null;

  function rotatedFootprintCells(placed: (typeof placements)[number]) {
    const { w, d } = rotatedFootprint(placed.itemId, placed.rotation);
    const cells: { x: number; z: number }[] = [];
    for (let dz = 0; dz < d; dz++) {
      for (let dx = 0; dx < w; dx++) cells.push({ x: placed.x + dx, z: placed.z + dz });
    }
    return cells;
  }

  const tap = Gesture.Tap()
    .runOnJS(true)
    .maxDistance(14)
    .onEnd((event) => {
      const cell = tapToCell(plan, event.x, event.y);
      if (!cell) return;
      const hit = placementAt(cell.x, cell.z);
      if (hit) {
        setSelectedId(hit.id);
        setPendingItemId(null);
        setRotation(hit.rotation);
      }
      setCursor(cell);
    });

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(14)
    .onBegin(() => {
      startYaw.current = homeCameraState.yaw;
    })
    .onUpdate((event) => {
      homeCameraState.yaw = startYaw.current - event.translationX * 0.008;
    });

  if (!state) return null;

  // Wat er gebeurt als je nu bevestigt.
  const movingItemId = pendingItemId ?? placements.find((p) => p.id === selectedId)?.itemId ?? null;
  const check =
    movingItemId && cursor
      ? checkPlacement(
          plan,
          placements,
          movingItemId,
          cursor.x,
          cursor.z,
          rotation,
          pendingItemId ? undefined : (selectedId ?? undefined),
        )
      : null;
  const canConfirm = Boolean(check?.ok);

  const inTray = state.inventory.filter((entry) => isPlaceable(getItem(entry.itemId)));
  const selected = placements.find((p) => p.id === selectedId) ?? null;

  const confirm = async () => {
    if (!cursor || !movingItemId) return;
    const ok = pendingItemId
      ? await place(pendingItemId, { x: cursor.x, z: cursor.z, rotation })
      : selectedId
        ? await moveItem(selectedId, cursor.x, cursor.z, rotation)
        : false;
    if (ok) {
      setPendingItemId(null);
      setSelectedId(null);
      setCursor(null);
      setRotation(0);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Row style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Inrichten</Text>
          <Text style={styles.dim}>
            {placements.length}/{state.stats.slots} plekken ·{' '}
            {Math.round(state.stats.decorationBonus * 100)}% inrichtingsbonus ·{' '}
            {formatMoney(state.stats.incomePerHour)}/u
          </Text>
        </View>
        <Button label="Terug" tone="ghost" compact onPress={() => router.back()} />
      </Row>

      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <View style={styles.canvas}>
          <BaseScene
            plan={plan}
            placements={placements}
            selectedId={selectedId}
            highlight={cursor}
            highlightValid={canConfirm}
          />
        </View>
      </GestureDetector>

      {/* Wat je nu kunt doen */}
      <View style={styles.panel}>
        {movingItemId && cursor ? (
          <>
            <Text style={styles.panelTitle}>
              {getItem(movingItemId).icon} {getItem(movingItemId).name}
              {pendingItemId ? ' neerzetten' : ' verplaatsen'}
            </Text>
            <Text style={[styles.dim, !canConfirm && { color: theme.color.danger }]}>
              {canConfirm
                ? `Vak ${cursor.x + 1},${cursor.z + 1} is vrij`
                : check && !check.ok
                  ? PLACEMENT_PROBLEM_MESSAGE[check.problem]
                  : ''}
            </Text>
            <Row style={{ marginTop: 8 }}>
              <Button
                label="Draaien"
                compact
                tone="ghost"
                onPress={() => setRotation((r) => (r + 1) % 4)}
              />
              {selected ? (
                <Button
                  label="Opbergen"
                  compact
                  tone="ghost"
                  loading={busy}
                  onPress={async () => {
                    if (await storeItem(selected.id)) {
                      setSelectedId(null);
                      setCursor(null);
                    }
                  }}
                />
              ) : null}
              <View style={{ flex: 1 }} />
              <Button
                label={pendingItemId ? 'Zet neer' : 'Verplaats'}
                compact
                disabled={!canConfirm}
                loading={busy}
                onPress={() => void confirm()}
              />
            </Row>
          </>
        ) : (
          <Text style={styles.dim}>
            Kies hieronder iets uit je rugzak, of tik op een meubel om het te verplaatsen. Sleep om
            de kamer rond te draaien.
          </Text>
        )}
      </View>

      {/* Je spullen */}
      <View style={[styles.tray, { paddingBottom: insets.bottom + 8 }]}>
        <Text style={styles.trayLabel}>In je rugzak</Text>
        {inTray.length === 0 ? (
          <Text style={styles.dim}>
            Niets om neer te zetten. Zoek meubels in de stad of maak ze bij de Werkbank.
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {inTray.map((entry) => {
              const item = getItem(entry.itemId);
              const active = pendingItemId === entry.itemId;
              return (
                <Pressable
                  key={entry.itemId}
                  onPress={() => {
                    setPendingItemId(active ? null : entry.itemId);
                    setSelectedId(null);
                    setRotation(0);
                  }}
                  style={[
                    styles.trayItem,
                    { borderColor: active ? theme.color.accent : theme.color.border },
                  ]}
                >
                  <Text style={styles.trayIcon}>{item.icon}</Text>
                  <Text style={[styles.trayName, { color: rarityColor[item.rarity] }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.dim}>
                    {entry.quantity}x · {formatMoney(item.incomePerHour ?? 0)}/u
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
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
    minHeight: 92,
  },
  panelTitle: { color: theme.color.text, fontSize: 16, fontWeight: '700' },
  tray: {
    backgroundColor: theme.color.bgSoft,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  trayLabel: {
    color: theme.color.textDim,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
  },
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
