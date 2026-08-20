import { getItem, type InventoryEntryDto } from '@game/shared';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGame } from '../state/useGame';
import { Button, Empty, Row } from './components';
import { ItemRow, ItemSheet } from './ItemSheet';
import { theme } from './theme';

/**
 * Het pandjeshuis van binnen: alles verkopen wat je bij je hebt.
 *
 * Hetzelfde itemvenster als op het base-scherm, alleen mét de verkoopknoppen —
 * hier stá je immers bij de verkoper. De twee bulkknoppen stonden eerst op het
 * base-scherm; die horen hier, want ook zij gaan langs de server en die
 * weigert ze buiten een winkel.
 */
export function ShopSheet({ name, onClose }: { name: string; onClose: () => void }) {
  const state = useGame((s) => s.state);
  const busy = useGame((s) => s.busy);
  const sellItem = useGame((s) => s.sellItem);
  const discardItem = useGame((s) => s.discardItem);
  const sellAll = useGame((s) => s.sellAll);
  const clockOffset = useGame((s) => s.clockOffset);
  const [selected, setSelected] = useState<string | null>(null);

  if (!state) return null;
  const sellable = state.inventory.filter((entry) => getItem(entry.itemId).baseValue > 0);
  const selectedEntry: InventoryEntryDto | null =
    state.inventory.find((entry) => entry.itemId === selected) ?? null;

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{name}</Text>
              <Text style={styles.subtitle}>
                {sellable.length === 0
                  ? 'Je hebt niets bij je waar ik iets voor geef.'
                  : 'Laat maar zien wat je hebt.'}
              </Text>
            </View>
            <Button label="Weg" tone="ghost" compact onPress={onClose} />
          </Row>

          <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 8 }}>
            {sellable.length === 0 ? (
              <Empty text="Niets te verhandelen." />
            ) : (
              sellable.map((entry) => (
                <ItemRow key={entry.itemId} entry={entry} onPress={() => setSelected(entry.itemId)} />
              ))
            )}
          </ScrollView>

          {sellable.length > 0 ? (
            <Row>
              <Button
                label="Verkoop gewoon spul"
                tone="ghost"
                loading={busy}
                onPress={() => void sellAll('uncommon')}
              />
              <Button label="Verkoop alles" loading={busy} onPress={() => void sellAll('mythic')} />
            </Row>
          ) : null}
          <Text style={styles.hint}>
            "Gewoon spul" laat alles staan wat zeldzamer is dan ongewoon — zo verkoop je niet per
            ongeluk iets wat je in je woning had willen zetten.
          </Text>
        </View>
      </View>

      <ItemSheet
        entry={selectedEntry}
        sellMultiplier={state.stats.sellMultiplier}
        serverNow={Date.now() + clockOffset}
        canPlace={false}
        canSell
        full={false}
        onClose={() => setSelected(null)}
        onPlace={() => {}}
        onSwap={() => {}}
        onSell={(quantity) => {
          if (!selectedEntry) return;
          const itemId = selectedEntry.itemId;
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(4, 7, 16, 0.72)', justifyContent: 'flex-end' },
  panel: {
    maxHeight: '78%',
    backgroundColor: theme.color.panelSolid,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    borderTopWidth: 1,
    borderColor: theme.color.border,
    padding: theme.space(5),
    paddingBottom: theme.space(9),
  },
  title: { color: theme.color.text, fontSize: 20, fontWeight: '800' },
  subtitle: { color: theme.color.textDim, fontSize: 13, marginTop: 2 },
  list: { marginVertical: theme.space(3) },
  hint: { color: theme.color.textDim, fontSize: 11, marginTop: 10, lineHeight: 16 },
});
