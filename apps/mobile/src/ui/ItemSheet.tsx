import {
  dayIndexFor,
  formatMoney,
  getItem,
  marketMultiplier,
  stackValue,
  type InventoryEntryDto,
} from '@game/shared';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Row } from './components';
import { rarityColor, theme } from './theme';

/**
 * Eén regel in je rugzak. De hele regel is aan te tikken; wat je ermee kunt
 * staat in het venster dat dan opengaat.
 *
 * Drie knoppen naast elkaar op een telefoonbreedte werd onleesbaar, en het
 * aantal handelingen groeit nog: verkopen verhuist straks naar de winkel en
 * er komen meer soorten bij. Eén venster per item houdt de lijst rustig en
 * geeft die handelingen één vaste plek.
 */
export function ItemRow({ entry, onPress }: { entry: InventoryEntryDto; onPress: () => void }) {
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
export function ItemSheet({
  entry,
  sellMultiplier,
  serverNow,
  canPlace,
  canSell,
  sellHint,
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
  /** Verkopen kan alleen bij een pandjeshuis. */
  canSell: boolean;
  /** Waarom niet, en waar dan wel. */
  sellHint?: string;
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
  const worthSomething = each > 0;

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

          {!worthSomething ? (
            <Text style={styles.sheetHint}>Dit item is niet te verkopen.</Text>
          ) : canSell ? (
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
            <Text style={styles.sheetHint}>
              Waard: {formatMoney(all)} bij de pandjeshuizen.
              {sellHint ? `\n${sellHint}` : ''}
            </Text>
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

const styles = StyleSheet.create({
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  itemIcon: { fontSize: 24, width: 30, textAlign: 'center' },
  itemName: { color: theme.color.text, fontSize: 15, fontWeight: '600' },
  itemQty: { color: theme.color.textDim, fontWeight: '700' },
  itemMeta: { fontSize: 12, marginTop: 2 },
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
});
