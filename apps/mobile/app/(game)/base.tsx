import {
  formatDuration,
  formatMoney,
  getItem,
  getProperty,
  getVehicle,
  isPlaceable,
  nearestShop,
} from '@game/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useGame } from '../../src/state/useGame';
import { Bar, Button, Empty, Panel, Row, Screen, SectionTitle } from '../../src/ui/components';
import { ItemRow, ItemSheet } from '../../src/ui/ItemSheet';
import { rarityColor, theme } from '../../src/ui/theme';
import { useLiveVault } from '../../src/ui/useLiveVault';

export default function BaseScreen() {
  const router = useRouter();
  const state = useGame((s) => s.state);
  const place = useGame((s) => s.place);
  const refresh = useGame((s) => s.refresh);
  const sellItem = useGame((s) => s.sellItem);
  const discardItem = useGame((s) => s.discardItem);
  const clockOffset = useGame((s) => s.clockOffset);
  const vault = useLiveVault();
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  if (!state) return null;
  const property = getProperty(state.player.propertyId);
  const vehicle = getVehicle(state.player.vehicleId);
  const placedCount = state.placements.length;
  // Zit de woning vol, dan heeft "Plaats" geen zin meer: dan is wisselen de
  // enige zet, en die doe je in het inrichtscherm.
  const full = placedCount >= state.stats.slots;
  const placeable = state.inventory.filter((entry) => isPlaceable(getItem(entry.itemId)));
  const junk = state.inventory.filter((entry) => !isPlaceable(getItem(entry.itemId)));
  // Uit de lijst halen en niet apart bewaren, zodat het aantal in het venster
  // meeloopt met wat er werkelijk in je rugzak zit.
  const selectedEntry = state.inventory.find((entry) => entry.itemId === selected) ?? null;
  // Waar de dichtstbijzijnde winkel staat, gemeten vanaf je laatst bekende plek.
  const shop = nearestShop(state.player.x, state.player.z);

  return (
    <Screen
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

      <SectionTitle hint={full ? 'woning is vol' : 'tik voor opties'}>Te plaatsen</SectionTitle>
      {placeable.length === 0 ? (
        <Empty text="Zoek meubels en kunst in de stad om je inkomen te verhogen." />
      ) : (
        <Panel>
          {placeable.map((entry) => (
            <ItemRow key={entry.itemId} entry={entry} onPress={() => setSelected(entry.itemId)} />
          ))}
        </Panel>
      )}

      <SectionTitle hint={`${junk.reduce((s, e) => s + e.quantity, 0)} stuks · tik voor opties`}>
        Voor de handel
      </SectionTitle>
      {junk.length === 0 ? (
        <Empty text="Niets om te verhandelen." />
      ) : (
        <Panel>
          {junk.map((entry) => (
            <ItemRow key={entry.itemId} entry={entry} onPress={() => setSelected(entry.itemId)} />
          ))}
        </Panel>
      )}

      <Text style={styles.craftHint}>
        Verkopen doe je bij een pandjeshuis; er staan er drie in de stad. De dichtstbijzijnde is{' '}
        {shop ? `${shop.spot.name}, ${Math.round(shop.distance)} meter van waar je nu staat` : 'nog niet te bepalen'}.
        {'\n\n'}
        Tik een item aan om het weg te gooien of neer te zetten. Materialen niet verkopen maar
        omzetten in interieur? Dat doe je bij de Werkbank.
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

      <ItemSheet
        entry={selectedEntry}
        sellMultiplier={state.stats.sellMultiplier}
        serverNow={Date.now() + clockOffset}
        canPlace={selectedEntry ? isPlaceable(getItem(selectedEntry.itemId)) : false}
        // Verkopen kan alleen ter plekke bij de verkoper, en dit scherm is je
        // rugzak — niet de stad. Vanaf hier dus nooit.
        canSell={false}
        sellHint={
          shop ? `${shop.spot.name} ligt ${Math.round(shop.distance)} meter verderop.` : undefined
        }
        full={full}
        onClose={() => setSelected(null)}
        onPlace={() => {
          if (!selectedEntry) return;
          const itemId = selectedEntry.itemId;
          setSelected(null);
          void place(itemId);
        }}
        onSwap={() => {
          if (!selectedEntry) return;
          const itemId = selectedEntry.itemId;
          setSelected(null);
          router.push({ pathname: '/(game)/interior', params: { pak: itemId } });
        }}
        onSell={(quantity) => {
          if (!selectedEntry) return;
          const itemId = selectedEntry.itemId;
          // Sluiten vóór het verzoek: verkoop je de hele stapel, dan bestaat
          // de regel erna niet meer en zou het venster op niets staan.
          setSelected(null);
          void sellItem(itemId, quantity);
        }}
        onDiscard={(quantity) => {
          if (!selectedEntry) return;
          const itemId = selectedEntry.itemId;
          setSelected(null);
          void discardItem(itemId, quantity);
        }}
      />
    </Screen>
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
  craftHint: {
    color: theme.color.textDim,
    fontSize: 12,
    marginTop: 14,
    lineHeight: 18,
    textAlign: 'center',
  },
});
