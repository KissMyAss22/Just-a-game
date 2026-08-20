import { formatDuration, formatMoney, type PlayerStateDto } from '@game/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as api from '../../src/net/api';
import { useRouter } from 'expo-router';
import { navigationTarget, playerPosition } from '../../src/state/position';
import { useGame } from '../../src/state/useGame';
import { Button, Panel, Row, Screen, SectionTitle } from '../../src/ui/components';
import { theme } from '../../src/ui/theme';

type Tab = 'upgrades' | 'properties' | 'vehicles' | 'boosts';

export default function ShopScreen() {
  const router = useRouter();
  const applyState = useGame((s) => s.applyState);
  const toast = useGame((s) => s.toast);
  const buyBoost = useGame((s) => s.buyBoost);
  const clockOffset = useGame((s) => s.clockOffset);
  const [shop, setShop] = useState<api.ShopResponse | null>(null);
  const [boosts, setBoosts] = useState<Awaited<ReturnType<typeof api.fetchBoosts>> | null>(null);
  const [tab, setTab] = useState<Tab>('upgrades');
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [shopData, boostData] = await Promise.all([api.fetchShop(), api.fetchBoosts()]);
      setShop(shopData);
      setBoosts(boostData);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Winkel laden mislukt');
    }
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /** Elke aankoop geeft de nieuwe spelerstaat terug, dus die zetten we direct. */
  const buy = async (id: string, action: () => Promise<PlayerStateDto>) => {
    setPending(id);
    try {
      applyState(await action());
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Aankoop mislukt');
    } finally {
      setPending(null);
    }
  };

  if (!shop) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.color.accent} />
      </View>
    );
  }

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={styles.title}>Winkel</Text>
        <Text style={styles.cash}>{formatMoney(shop.cash)}</Text>
      </Row>

      <Row style={{ marginTop: 12 }}>
        {(
          [
            ['upgrades', 'Base'],
            ['properties', 'Woningen'],
            ['vehicles', 'Voertuigen'],
            ['boosts', 'Boosts'],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            label={label}
            compact
            tone={tab === key ? 'accent' : 'ghost'}
            onPress={() => setTab(key)}
          />
        ))}
      </Row>

      {tab === 'upgrades' ? (
        <>
          <SectionTitle hint="verhogen je passieve inkomen">Base-upgrades</SectionTitle>
          {shop.upgrades.map((upgrade) => (
            <Panel key={upgrade.id} style={styles.card}>
              <Row>
                <Text style={styles.icon}>{upgrade.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {upgrade.name}{' '}
                    <Text style={styles.dim}>
                      lvl {upgrade.level}/{upgrade.maxLevel}
                    </Text>
                  </Text>
                  <Text style={styles.dim}>{upgrade.description}</Text>
                </View>
                <Button
                  label={upgrade.price === null ? 'Max' : formatMoney(upgrade.price)}
                  compact
                  disabled={upgrade.price === null || !upgrade.affordable}
                  loading={pending === upgrade.id}
                  onPress={() => void buy(upgrade.id, () => api.buyUpgrade(upgrade.id))}
                />
              </Row>
            </Panel>
          ))}
        </>
      ) : null}

      {tab === 'properties' ? (
        <>
          <SectionTitle hint="loop erheen om te kopen">Te koop</SectionTitle>
          <Text style={styles.dim}>
            Woningen staan in de stad. Kies er een uit, loop naar het adres en koop hem bij de
            deur — daar staat een bord met de prijs.
          </Text>
          <View style={{ height: 10 }} />
          {shop.properties.map((property) => {
            const distance =
              property.x !== null && property.z !== null
                ? Math.hypot(property.x - playerPosition.x, property.z - playerPosition.z)
                : null;
            // Het eiland ligt los in zee en er is nog geen boot; dat kun je
            // beter hier zeggen dan iemand er tevergeefs heen laten lopen.
            const unreachable = property.id === 'island_estate';
            return (
              <Panel key={property.id} style={styles.card}>
                <Row>
                  <Text style={styles.icon}>{property.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {property.name}
                      {property.unit ? <Text style={styles.dim}>  nr {property.unit}</Text> : null}
                    </Text>
                    <Text style={styles.dim}>
                      {formatMoney(property.incomePerHour)}/u · {property.slots} plekken · lvl{' '}
                      {property.requiredLevel}
                    </Text>
                    {property.street ? (
                      <Text style={styles.dim}>
                        {property.street}
                        {distance !== null ? ` · ${Math.round(distance)} m` : ''}
                        {unreachable ? ' · bereikbaar per boot' : ''}
                      </Text>
                    ) : null}
                  </View>
                  {property.current ? (
                    <Text style={styles.badge}>Huidig</Text>
                  ) : property.owned ? (
                    <Text style={styles.dim}>gehad</Text>
                  ) : !property.unlocked ? (
                    <Text style={styles.dim}>lvl {property.requiredLevel}</Text>
                  ) : (
                    <Button
                      label={formatMoney(property.price)}
                      compact
                      tone="ghost"
                      disabled={property.x === null || unreachable}
                      onPress={() => {
                        if (property.x === null || property.z === null) return;
                        navigationTarget.current = {
                          x: property.x,
                          z: property.z,
                          label: property.name,
                        };
                        router.navigate('/(game)/city');
                      }}
                    />
                  )}
                </Row>
              </Panel>
            );
          })}
        </>
      ) : null}

      {tab === 'boosts' && boosts ? (
        <>
          <SectionTitle hint="met gems, tijdelijk actief">Boosts</SectionTitle>
          {boosts.active.length > 0 ? (
            <Panel style={styles.card}>
              <Text style={styles.dim}>Nu actief</Text>
              {boosts.active.map((active) => {
                const def = boosts.catalog.find((b) => b.id === active.boostId);
                const remaining = (active.expiresAt - (Date.now() + clockOffset)) / 1000;
                return (
                  <Row key={active.boostId} style={{ marginTop: 6 }}>
                    <Text style={styles.icon}>{def?.icon ?? '⚡'}</Text>
                    <Text style={[styles.name, { flex: 1 }]}>{def?.name ?? active.boostId}</Text>
                    <Text style={styles.badge}>nog {formatDuration(remaining)}</Text>
                  </Row>
                );
              })}
            </Panel>
          ) : null}

          {boosts.catalog.map((boost) => (
            <Panel key={boost.id} style={styles.card}>
              <Row>
                <Text style={styles.icon}>{boost.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{boost.name}</Text>
                  <Text style={styles.dim}>
                    {boost.description} · {boost.durationHours} uur
                  </Text>
                </View>
                <Button
                  label={`💎 ${boost.priceGems}`}
                  compact
                  disabled={!boost.affordable}
                  loading={pending === boost.id}
                  onPress={async () => {
                    setPending(boost.id);
                    if (await buyBoost(boost.id)) await load();
                    setPending(null);
                  }}
                />
              </Row>
            </Panel>
          ))}
        </>
      ) : null}

      {tab === 'vehicles' ? (
        <>
          <SectionTitle hint="sneller lopen, meer dragen">Voertuigen</SectionTitle>
          {shop.vehicles.map((vehicle) => (
            <Panel key={vehicle.id} style={styles.card}>
              <Row>
                <Text style={styles.icon}>{vehicle.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{vehicle.name}</Text>
                  <Text style={styles.dim}>
                    {vehicle.speedMultiplier}x snelheid · +{vehicle.carryBonus} plekken · lvl{' '}
                    {vehicle.requiredLevel}
                  </Text>
                </View>
                {vehicle.current ? (
                  <Text style={styles.badge}>In gebruik</Text>
                ) : vehicle.owned ? (
                  <Button
                    label="Gebruik"
                    compact
                    tone="ghost"
                    loading={pending === vehicle.id}
                    onPress={() => void buy(vehicle.id, () => api.equipVehicle(vehicle.id))}
                  />
                ) : (
                  <Button
                    label={!vehicle.unlocked ? `lvl ${vehicle.requiredLevel}` : formatMoney(vehicle.price)}
                    compact
                    disabled={!vehicle.affordable || !vehicle.unlocked}
                    loading={pending === vehicle.id}
                    onPress={() => void buy(vehicle.id, () => api.buyVehicle(vehicle.id))}
                  />
                )}
              </Row>
            </Panel>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: theme.color.bg, alignItems: 'center', justifyContent: 'center' },
  title: { color: theme.color.text, fontSize: 26, fontWeight: '800' },
  cash: { color: theme.color.cash, fontSize: 18, fontWeight: '800' },
  card: { marginBottom: 8 },
  icon: { fontSize: 26, width: 34, textAlign: 'center' },
  name: { color: theme.color.text, fontSize: 16, fontWeight: '700' },
  dim: { color: theme.color.textDim, fontSize: 12, marginTop: 2 },
  badge: {
    color: theme.color.accent,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
  },
});
