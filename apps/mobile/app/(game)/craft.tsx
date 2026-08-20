import { formatMoney, getItem } from '@game/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as api from '../../src/net/api';
import { useGame } from '../../src/state/useGame';
import { Button, Empty, Panel, Row, Screen, SectionTitle } from '../../src/ui/components';
import { rarityColor, theme } from '../../src/ui/theme';

/**
 * De werkbank. De server beslist uiteindelijk of een recept mag, maar de app
 * rekent met dezelfde `checkRecipe` uit @game/shared — zo klopt de knop altijd
 * met wat er gaat gebeuren.
 */
export default function CraftScreen() {
  const state = useGame((s) => s.state);
  const busy = useGame((s) => s.busy);
  const craft = useGame((s) => s.craft);
  const toast = useGame((s) => s.toast);
  const [recipes, setRecipes] = useState<api.RecipeEntry[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRecipes((await api.fetchRecipes()).recipes);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Recepten laden mislukt');
    }
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!recipes || !state) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.color.accent} />
      </View>
    );
  }

  const cash = state.player.cash;
  const level = state.player.level;

  /** Hoe vaak dit recept nu gemaakt kan worden, met wat je bij je hebt. */
  const maxTimes = (entry: api.RecipeEntry): number => {
    const owned = new Map(state.inventory.map((e) => [e.itemId, e.quantity]));
    let max = entry.cashCost > 0 ? Math.floor(cash / entry.cashCost) : 50;
    for (const input of entry.inputs) {
      max = Math.min(max, Math.floor((owned.get(input.itemId) ?? 0) / input.quantity));
    }
    return Math.max(0, Math.min(50, max));
  };

  const run = async (entry: api.RecipeEntry, times: number) => {
    setPending(entry.id);
    if (await craft(entry.id, times)) await load();
    setPending(null);
  };

  const unlocked = recipes.filter((r) => level >= r.requiredLevel);
  const locked = recipes.filter((r) => level < r.requiredLevel);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={styles.title}>Werkbank</Text>
        <Text style={styles.cash}>{formatMoney(cash)}</Text>
      </Row>
      <Text style={styles.intro}>
        Materialen die je in de stad vindt worden hier interieur. Wat je maakt ligt nergens op
        straat — craften is de enige manier om eraan te komen.
      </Text>

      <SectionTitle hint={`${unlocked.length} beschikbaar`}>Recepten</SectionTitle>
      {unlocked.length === 0 ? <Empty text="Nog geen recepten op jouw level." /> : null}

      {unlocked.map((entry) => {
        const max = maxTimes(entry);
        return (
          <Panel key={entry.id} style={styles.card}>
            <Row>
              <Text style={styles.icon}>{entry.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{entry.name}</Text>
                <Text style={styles.dim}>{entry.description}</Text>
              </View>
            </Row>

            <View style={styles.arrowRow}>
              <View style={{ flex: 1 }}>
                {entry.inputs.map((input) => {
                  const have =
                    state.inventory.find((e) => e.itemId === input.itemId)?.quantity ?? 0;
                  const enough = have >= input.quantity;
                  return (
                    <Text
                      key={input.itemId}
                      style={[styles.ingredient, !enough && { color: theme.color.danger }]}
                    >
                      {input.icon} {input.name} {have}/{input.quantity}
                    </Text>
                  );
                })}
                <Text style={[styles.ingredient, cash < entry.cashCost && { color: theme.color.danger }]}>
                  💵 {formatMoney(entry.cashCost)}
                </Text>
              </View>

              <Text style={styles.arrow}>→</Text>

              <View style={styles.output}>
                <Text style={styles.outputIcon}>{entry.output.icon}</Text>
                <Text
                  style={[styles.outputName, { color: rarityColor[entry.output.rarity] }]}
                  numberOfLines={1}
                >
                  {entry.output.name}
                </Text>
                <Text style={styles.dim}>{formatMoney(entry.output.incomePerHour)}/u</Text>
              </View>
            </View>

            <Row style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              {max > 1 ? (
                <Button
                  label={`Maak ${max}x`}
                  compact
                  tone="ghost"
                  loading={pending === entry.id && busy}
                  onPress={() => void run(entry, max)}
                />
              ) : null}
              <Button
                label="Maak"
                compact
                disabled={max < 1}
                loading={pending === entry.id && busy}
                onPress={() => void run(entry, 1)}
              />
            </Row>
          </Panel>
        );
      })}

      {locked.length > 0 ? (
        <>
          <SectionTitle hint="nog niet vrijgespeeld">Later</SectionTitle>
          {locked.map((entry) => (
            <Panel key={entry.id} style={[styles.card, { opacity: 0.5 }]}>
              <Row>
                <Text style={styles.icon}>{entry.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{entry.name}</Text>
                  <Text style={styles.dim}>
                    Vanaf level {entry.requiredLevel} · {getItem(entry.output.itemId).name}
                  </Text>
                </View>
                <Text style={styles.lockLevel}>lvl {entry.requiredLevel}</Text>
              </Row>
            </Panel>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: theme.color.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: theme.color.text, fontSize: 26, fontWeight: '800' },
  cash: { color: theme.color.cash, fontSize: 18, fontWeight: '800' },
  intro: { color: theme.color.textDim, fontSize: 13, lineHeight: 19, marginTop: 6 },
  card: { marginBottom: 8 },
  icon: { fontSize: 26, width: 34, textAlign: 'center' },
  name: { color: theme.color.text, fontSize: 16, fontWeight: '700' },
  dim: { color: theme.color.textDim, fontSize: 12, marginTop: 2 },
  arrowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  ingredient: { color: theme.color.text, fontSize: 13, marginBottom: 2 },
  arrow: { color: theme.color.textDim, fontSize: 20, paddingHorizontal: 4 },
  output: { width: 104, alignItems: 'center' },
  outputIcon: { fontSize: 30 },
  outputName: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  lockLevel: { color: theme.color.textDim, fontSize: 13, fontWeight: '700', paddingHorizontal: 8 },
});
