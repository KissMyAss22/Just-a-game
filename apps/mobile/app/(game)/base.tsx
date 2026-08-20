import {
  dayIndexFor,
  formatDuration,
  formatMoney,
  getItem,
  getProperty,
  getVehicle,
  isPlaceable,
  marketMultiplier,
  stackValue,
  type InventoryEntryDto,
} from '@game/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useGame } from '../../src/state/useGame';
import { Bar, Button, Empty, Panel, Row, Screen, SectionTitle } from '../../src/ui/components';
import { rarityColor, theme } from '../../src/ui/theme';
import { useLiveVault } from '../../src/ui/useLiveVault';

/**
 * Eén regel in je rugzak. De hele regel is aan te tikken; wat je ermee kunt
 * staat in het venster dat dan opengaat.
 *
 * Drie knoppen naast elkaar op een telefoonbreedte werd onleesbaar, en het
 * aantal handelingen groeit nog: verkopen verhuist straks naar de winkel en
 * er komen meer soorten bij. Eén venster per item houdt de lijst rustig en
 * geeft die handelingen één vaste plek.
 */
function ItemRow({ entry, onPress }: { entry: InventoryEntryDto; onPress: () => void }) {
  const item = getItem(entry.itemId);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.itemRow, pressed && { opacity: 0.6 }]}>
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
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

/**
 * Wat je met één item kunt doen.
 *
 * De prijs wordt hier uitgerekend en niet bij de server opgehaald: de
 * marktschommeling is een gedeelde, deterministische functie van de dag, dus
 * client en server komen op precies hetzelfde bedrag uit. Zou dit een extra
 * verzoek zijn, dan stond er een half seconde lang een streepje.
 */
function ItemSheet({
  entry,
  sellMultiplier,
  serverNow,
  canPlace,
  full,
  onClose,
  onPlace,
  onSwap,
  onSell,
  onDiscard,
}: {
  entry: InventoryEntryDto | null;
  sellMultiplier: number;
  serverNow: number;
  canPlace: boolean;
  full: boolean;
  onClose: () => void;
  onPlace: () => void;
  onSwap: () => void;
  onSell: (quantity: number) => void;
  onDiscard: (quantity: number) => void;
}) {
  if (!entry) return null;
  const item = getItem(entry.itemId);
  const market = marketMultiplier(item.category, dayIndexFor(serverNow));
  const each = stackValue(item.id, 1, market * sellMultiplier);
  const all = stackValue(item.id, entry.quantity, market * sellMultiplier);
  const sellable = each > 0;

  const confirmDiscard = (quantity: number): void => {
    Alert.alert(
      'Weggooien?',
      `${quantity}x ${item.name} verdwijnt. Je krijgt er niets voor terug.`,
      [
        { text: 'Laat maar', style: 'cancel' },
        { text: 'Weggooien', style: 'destructive', onPress: () => onDiscard(quantity) },
      ],
    );
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        {/* Een tik binnen het venster mag hem niet sluiten. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Row>
            <Text style={styles.sheetIcon}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetName}>{item.name}</Text>
              <Text style={[styles.itemMeta, { color: rarityColor[item.rarity] }]}>
                {entry.quantity} in je rugzak · {item.category}
                {item.incomePerHour ? ` · ${formatMoney(item.incomePerHour)}/u` : ''}
              </Text>
            </View>
          </Row>

          <View style={{ height: 14 }} />

          {canPlace ? (
            <Button label={full ? 'Wisselen met iets in je woning' : 'Neerzetten in je woning'}
              onPress={full ? onSwap : onPlace} />
          ) : null}

          {sellable ? (
            <>
              <View style={{ height: 8 }} />
              <Row>
                <Button label={`Verkoop 1 · ${formatMoney(each)}`} tone="ghost" onPress={() => onSell(1)} />
                {entry.quantity > 1 ? (
                  <Button
                    label={`Verkoop alles · ${formatMoney(all)}`}
                    tone="ghost"
                    onPress={() => onSell(entry.quantity)}
                  />
                ) : null}
              </Row>
              <Text style={styles.sheetHint}>
                Dagprijs {Math.round(market * 100)}% van normaal
                {sellMultiplier !== 1 ? `, jouw bonus x${sellMultiplier.toFixed(2)}` : ''}.
              </Text>
            </>
          ) : (
            <Text style={styles.sheetHint}>Dit item is niet te verkopen.</Text>
          )}

          <View style={{ height: 8 }} />
          <Row>
            <Button label="Gooi 1 weg" tone="danger" onPress={() => confirmDiscard(1)} />
            {entry.quantity > 1 ? (
              <Button
                label={`Gooi alle ${entry.quantity} weg`}
                tone="danger"
                onPress={() => confirmDiscard(entry.quantity)}
              />
            ) : null}
          </Row>

          <View style={{ height: 10 }} />
          <Button label="Sluiten" tone="ghost" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function BaseScreen() {
  const router = useRouter();
  const state = useGame((s) => s.state);
  const busy = useGame((s) => s.busy);
  const place = useGame((s) => s.place);
  const sellAll = useGame((s) => s.sellAll);
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
        Om te verkopen
      </SectionTitle>
      {junk.length === 0 ? (
        <Empty text="Niets om te verkopen." />
      ) : (
        <Panel>
          {junk.map((entry) => (
            <ItemRow key={entry.itemId} entry={entry} onPress={() => setSelected(entry.itemId)} />
          ))}
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
        Tik een item aan om er één te verkopen, de hele stapel te verkopen of hem weg te gooien.
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

      <ItemSheet
        entry={selectedEntry}
        sellMultiplier={state.stats.sellMultiplier}
        serverNow={Date.now() + clockOffset}
        canPlace={selectedEntry ? isPlaceable(getItem(selectedEntry.itemId)) : false}
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
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.border,
  },
  itemIcon: { fontSize: 24, width: 30, textAlign: 'center' },
  chevron: { color: theme.color.textDim, fontSize: 22, fontWeight: '700', paddingHorizontal: 4 },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 7, 16, 0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.color.panelSolid,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    borderTopWidth: 1,
    borderColor: theme.color.border,
    padding: theme.space(5),
    paddingBottom: theme.space(9),
  },
  sheetIcon: { fontSize: 34 },
  sheetName: { color: theme.color.text, fontSize: 19, fontWeight: '800' },
  sheetHint: { color: theme.color.textDim, fontSize: 12, marginTop: 8, lineHeight: 17 },
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
