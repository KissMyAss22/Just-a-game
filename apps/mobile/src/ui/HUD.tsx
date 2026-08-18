import { districtAtWorld, formatDuration, formatMoney } from '@game/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playerPosition } from '../state/position';
import { useGame } from '../state/useGame';
import { Bar, Button } from './components';
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

export function HUD() {
  const insets = useSafeAreaInsets();
  const state = useGame((s) => s.state);
  const busy = useGame((s) => s.busy);
  const claimVault = useGame((s) => s.claimVault);
  const toasts = useGame((s) => s.toasts);
  const vault = useLiveVault();
  const surroundings = useSurroundings();

  if (!state) return null;
  const { player, stats } = state;
  const carried = state.inventory.reduce((sum, entry) => sum + entry.quantity, 0);
  const vaultBalance = vault?.vaultBalance ?? state.vault.balance;
  const vaultFull = vaultBalance >= stats.vaultCapacity;

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

      {/* Kluis */}
      <View style={styles.vaultCard}>
        <Text style={styles.vaultLabel}>KLUIS</Text>
        <Text style={[styles.vaultValue, vaultFull && { color: theme.color.danger }]}>
          {formatMoney(vaultBalance)}
        </Text>
        <Bar
          value={vaultBalance}
          max={stats.vaultCapacity}
          color={vaultFull ? theme.color.danger : theme.color.accent}
          height={6}
        />
        <Text style={styles.vaultHint}>
          {formatMoney(stats.incomePerHour)}/u ·{' '}
          {vaultFull
            ? 'vol!'
            : vault && Number.isFinite(vault.secondsUntilFull)
              ? `vol over ${formatDuration(vault.secondsUntilFull)}`
              : `max ${formatMoney(stats.vaultCapacity)}`}
        </Text>
        <Button
          label="Legen"
          compact
          onPress={() => void claimVault()}
          disabled={vaultBalance < 1}
          loading={busy}
        />
      </View>

      {/* Rugzak */}
      <View style={[styles.backpack, { bottom: insets.bottom + 200 }]} pointerEvents="none">
        <Text style={styles.backpackText}>
          🎒 {carried}/{stats.inventorySlots}
        </Text>
      </View>

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
