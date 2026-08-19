import {
  formatDuration,
  formatMoney,
  getItem,
  getProperty,
  getVehicle,
  isPlaceable,
  type InventoryEntryDto,
} from '@game/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '../../src/state/useGame';
import { Bar, Button, Empty, Panel, Row, SectionTitle } from '../../src/ui/components';
import { rarityColor, theme } from '../../src/ui/theme';
import { useLiveVault } from '../../src/ui/useLiveVault';

function ItemRow({
  entry,
  action,
  actionLabel,
  secondary,
  secondaryLabel,
}: {
  entry: InventoryEntryDto;
  action: () => void;
  actionLabel: string;
  secondary?: () => void;
  secondaryLabel?: string;
}) {
  const item = getItem(entry.itemId);
  return (
    <View style={styles.itemRow}>
      <Text style={styles.itemIcon}>{item.icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName}>
          {item.name} <Text style={styles.itemQty}>x{entry.quantity}</Text>
        </Text>
        <Text style={[styles.itemMeta, { color: rarityColor[item.rarity] }]}>
          {item.incomePerHour ? `${formatMoney(item.incomePerHour)}/u` : 'geen inkomen'}
          {item.flex ? ` · ${item.flex} flex` : ''}
        </Text>
      </View>
      {secondary && secondaryLabel ? (
        <Button label={secondaryLabel} onPress={secondary} tone="ghost" compact />
      ) : null}
      <Button label={actionLabel} onPress={action} compact />
    </View>
  );
}

export default function BaseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const state = useGame((s) => s.state);
  const busy = useGame((s) => s.busy);
  const place = useGame((s) => s.place);
  const sellAll = useGame((s) => s.sellAll);
  const refresh = useGame((s) => s.refresh);
  const vault = useLiveVault();
  const [refreshing, setRefreshing] = useState(false);

  if (!state) return null;
  const property = getProperty(state.player.propertyId);
  const vehicle = getVehicle(state.player.vehicleId);
  const placedCount = state.placements.length;
  const placeable = state.inventory.filter((entry) => isPlaceable(getItem(entry.itemId)));
  const junk = state.inventory.filter((entry) => !isPlaceable(getItem(entry.itemId)));

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 14, paddingTop: insets.top + 10, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={theme.color.accent}
          onRefresh={async () => {
            setRefreshing(true);
            await refresh();
            setRefreshing(false);
          }}
        />
      }
    >
      <Pressable onPress={() => router.push('/(game)/profile')} style={styles.titleRow}>
        <Text style={styles.title}>{state.player.displayName}</Text>
        <Text style={styles.editHint}>personage aanpassen ›</Text>
      </Pressable>

      <Panel>
        <Row>
          <Text style={styles.bigIcon}>{property.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.propertyName}>{property.name}</Text>
            <Text style={styles.dim}>
              {placedCount}/{state.stats.slots} plekken bezet · {vehicle.icon} {vehicle.name}
            </Text>
          </View>
        </Row>

        <View style={styles.statGrid}>
          <Stat label="Inkomen" value={`${formatMoney(state.stats.incomePerHour)}/u`} />
          <Stat label="Flex Score" value={formatMoney(state.stats.flexScore)} />
          <Stat
            label="Flexbonus"
            value={`+${Math.round(state.stats.flexMultiplier * 100)}%`}
          />
          <Stat
            label="Inrichting"
            value={`+${Math.round(state.stats.decorationBonus * 100)}%`}
          />
          <Stat label="Offline" value={`${state.stats.offlineCapHours} u`} />
        </View>

        <Text style={styles.dim}>
          Basis {formatMoney(state.stats.baseIncomePerHour)}/u, met bonussen{' '}
          {formatMoney(state.stats.incomePerHour)}/u
        </Text>
      </Panel>

      <SectionTitle
        hint={
          vault && Number.isFinite(vault.secondsUntilFull)
            ? `vol over ${formatDuration(vault.secondsUntilFull)}`
            : undefined
        }
      >
        Kluis
      </SectionTitle>
      <Panel>
        <Text style={styles.vaultValue}>
          {formatMoney(vault?.vaultBalance ?? state.vault.balance)}
          <Text style={styles.dim}> / {formatMoney(state.stats.vaultCapacity)}</Text>
        </Text>
        <Bar
          value={vault?.vaultBalance ?? state.vault.balance}
          max={state.stats.vaultCapacity}
          height={8}
        />
        <Text style={styles.dim}>
          Loopt door als de app dicht is, tot {state.stats.offlineCapHours} uur.
        </Text>
      </Panel>

      <SectionTitle hint={`${placedCount}/${state.stats.slots} plekken`}>In je woning</SectionTitle>
      <Panel>
        <Row>
          <Text style={styles.bigIcon}>🛋️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.propertyName}>
              {placedCount === 0 ? 'Nog leeg' : `${placedCount} voorwerpen`}
            </Text>
            <Text style={styles.dim}>
              Zet je spullen op een echte plek neer. Hoe voller de kamer, hoe hoger je
              inrichtingsbonus.
            </Text>
          </View>
          <Button
            label="Inrichten"
            compact
            onPress={() => router.push('/(game)/interior')}
          />
        </Row>
      </Panel>

      <SectionTitle hint="leveren inkomen op">Te plaatsen</SectionTitle>
      {placeable.length === 0 ? (
        <Empty text="Zoek meubels en kunst in de stad om je inkomen te verhogen." />
      ) : (
        <Panel>
          {placeable.map((entry) => (
            <ItemRow
              key={entry.itemId}
              entry={entry}
              actionLabel="Plaats"
              action={() => void place(entry.itemId)}
            />
          ))}
        </Panel>
      )}

      <SectionTitle hint={`${junk.reduce((s, e) => s + e.quantity, 0)} stuks`}>
        Om te verkopen
      </SectionTitle>
      {junk.length === 0 ? (
        <Empty text="Niets om te verkopen." />
      ) : (
        <Panel>
          {junk.map((entry) => {
            const item = getItem(entry.itemId);
            return (
              <View key={entry.itemId} style={styles.itemRow}>
                <Text style={styles.itemIcon}>{item.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>
                    {item.name} <Text style={styles.itemQty}>x{entry.quantity}</Text>
                  </Text>
                  <Text style={[styles.itemMeta, { color: rarityColor[item.rarity] }]}>
                    {item.category}
                  </Text>
                </View>
              </View>
            );
          })}
        </Panel>
      )}

      <View style={{ height: 12 }} />
      <Row>
        <Button
          label="Verkoop gewoon spul"
          onPress={() => void sellAll('uncommon')}
          loading={busy}
          tone="ghost"
        />
        <Button label="Verkoop alles" onPress={() => void sellAll('mythic')} loading={busy} />
      </Row>
      <Text style={styles.craftHint}>
        Materialen niet verkopen maar omzetten in interieur? Dat doe je bij de Werkbank.
      </Text>

      <SectionTitle hint={state.player.rebirthCount > 0 ? `${state.player.rebirthCount}x gedaan` : undefined}>
        Rebirth
      </SectionTitle>
      <Panel>
        <Row>
          <Text style={styles.bigIcon}>🏛️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.propertyName}>
              {state.player.erfenis > 0 ? `${formatMoney(state.player.erfenis)} erfenis` : 'Opnieuw beginnen'}
            </Text>
            <Text style={styles.dim}>
              Ruil je hele voortgang in voor permanente voordelen.
            </Text>
          </View>
          <Button label="Bekijk" compact tone="ghost" onPress={() => router.push('/(game)/rebirth')} />
        </Row>
      </Panel>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  titleRow: { marginBottom: 12 },
  title: { color: theme.color.text, fontSize: 26, fontWeight: '800' },
  editHint: { color: theme.color.accent, fontSize: 12, fontWeight: '600', marginTop: 2 },
  bigIcon: { fontSize: 34 },
  propertyName: { color: theme.color.text, fontSize: 19, fontWeight: '700' },
  dim: { color: theme.color.textDim, fontSize: 12, marginTop: 4 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 8 },
  stat: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: theme.radius.sm,
    paddingVertical: 7,
    paddingHorizontal: 11,
    minWidth: '46%',
  },
  statLabel: { color: theme.color.textDim, fontSize: 11 },
  statValue: { color: theme.color.text, fontSize: 16, fontWeight: '700' },
  vaultValue: { color: theme.color.cash, fontSize: 24, fontWeight: '800', marginBottom: 8 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.border,
  },
  itemIcon: { fontSize: 24, width: 30, textAlign: 'center' },
  itemName: { color: theme.color.text, fontSize: 15, fontWeight: '600' },
  itemQty: { color: theme.color.textDim, fontWeight: '400' },
  itemMeta: { fontSize: 11, marginTop: 2 },
  craftHint: {
    color: theme.color.textDim,
    fontSize: 12,
    marginTop: 14,
    lineHeight: 18,
    textAlign: 'center',
  },
});
