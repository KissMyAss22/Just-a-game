import { formatDuration, formatMoney, getItem, getVehicle } from '@game/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '../../src/net/api';
import { useGame } from '../../src/state/useGame';
import { Bar, Button, Panel, Row, SectionTitle } from '../../src/ui/components';
import { theme } from '../../src/ui/theme';

type RewardDto = { kind: string; amount?: number; itemId?: string; vehicleId?: string };

/** Beloningen kort en leesbaar weergeven. */
function rewardLabel(reward: RewardDto): string {
  switch (reward.kind) {
    case 'cash':
      return `💵 ${formatMoney(reward.amount ?? 0)}`;
    case 'gems':
      return `💎 ${reward.amount ?? 0}`;
    case 'item':
      return reward.itemId
        ? `${getItem(reward.itemId).icon} ${getItem(reward.itemId).name}`
        : 'item';
    case 'vehicle':
      return reward.vehicleId
        ? `${getVehicle(reward.vehicleId).icon} ${getVehicle(reward.vehicleId).name}`
        : 'voertuig';
    case 'boost':
      return '⚡ boost';
    default:
      return reward.kind;
  }
}

export default function PassScreen() {
  const insets = useSafeAreaInsets();
  const toast = useGame((s) => s.toast);
  const refresh = useGame((s) => s.refresh);
  const [season, setSeason] = useState<api.SeasonResponse | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSeason(await api.fetchSeason());
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Season pass laden mislukt');
    }
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const run = async (key: string, action: () => Promise<unknown>) => {
    setPending(key);
    try {
      await action();
      await load();
      await refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Mislukt');
    } finally {
      setPending(null);
    }
  };

  if (!season) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.color.accent} />
      </View>
    );
  }

  const remaining = Math.max(0, season.season.endsAt - season.serverTime) / 1000;
  const dailies = season.quests.filter((q) => q.scope === 'daily');
  const weeklies = season.quests.filter((q) => q.scope === 'weekly');

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 14, paddingTop: insets.top + 10, paddingBottom: 40 }}
    >
      <Text style={styles.title}>Seizoen {season.season.index}</Text>
      <Text style={styles.subtitle}>
        {season.season.name} · nog {formatDuration(remaining)}
      </Text>

      <Panel style={{ marginTop: 12 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={styles.tier}>Tier {season.tier}</Text>
          <Text style={styles.dim}>
            {season.xpIntoTier}/{season.xpForNextTier} xp
          </Text>
        </Row>
        <Bar value={season.xpIntoTier} max={season.xpForNextTier} color={theme.color.xp} />
        {season.premium ? (
          <Text style={[styles.dim, { color: theme.color.accent }]}>Premium spoor actief</Text>
        ) : (
          <>
            <Text style={styles.dim}>
              Het premium spoor geeft er per tier een extra beloning bij — en genoeg gems om het
              volgende seizoen weer te ontgrendelen.
            </Text>
            <View style={{ height: 8 }} />
            <Button
              label={`Ontgrendel · 💎 ${season.premiumPriceGems}`}
              disabled={season.gems < season.premiumPriceGems}
              loading={pending === 'premium'}
              onPress={() => void run('premium', api.unlockPremium)}
            />
          </>
        )}
      </Panel>

      <SectionTitle hint="elke dag nieuw">Dagelijkse opdrachten</SectionTitle>
      {dailies.map((quest) => (
        <QuestCard
          key={quest.id}
          quest={quest}
          pending={pending === quest.id}
          onClaim={() => void run(quest.id, () => api.claimQuest(quest.id))}
        />
      ))}

      <SectionTitle hint="elke week nieuw">Weekopdrachten</SectionTitle>
      {weeklies.map((quest) => (
        <QuestCard
          key={quest.id}
          quest={quest}
          pending={pending === quest.id}
          onClaim={() => void run(quest.id, () => api.claimQuest(quest.id))}
        />
      ))}

      <SectionTitle hint={`${season.tier}/${season.tiers.length} gehaald`}>Beloningen</SectionTitle>
      {season.tiers.map((tier) => {
        const reached = season.tier >= tier.tier;
        const freeClaimed = season.claimedFree.includes(tier.tier);
        const premiumClaimed = season.claimedPremium.includes(tier.tier);
        return (
          <Panel key={tier.tier} style={[styles.tierCard, !reached && { opacity: 0.45 }]}>
            <Text style={styles.tierNumber}>{tier.tier}</Text>
            <View style={{ flex: 1, gap: 6 }}>
              <TrackRow
                label="Gratis"
                rewards={tier.free}
                claimed={freeClaimed}
                claimable={reached && !freeClaimed && tier.free.length > 0}
                pending={pending === `free-${tier.tier}`}
                onClaim={() => void run(`free-${tier.tier}`, () => api.claimTier(tier.tier, 'free'))}
              />
              <TrackRow
                label="Premium"
                rewards={tier.premium}
                claimed={premiumClaimed}
                claimable={reached && season.premium && !premiumClaimed}
                pending={pending === `premium-${tier.tier}`}
                onClaim={() =>
                  void run(`premium-${tier.tier}`, () => api.claimTier(tier.tier, 'premium'))
                }
                locked={!season.premium}
              />
            </View>
          </Panel>
        );
      })}
    </ScrollView>
  );
}

function QuestCard({
  quest,
  pending,
  onClaim,
}: {
  quest: api.SeasonResponse['quests'][number];
  pending: boolean;
  onClaim: () => void;
}) {
  return (
    <Panel style={styles.card}>
      <Row>
        <View style={{ flex: 1 }}>
          <Text style={styles.questName}>{quest.name}</Text>
          <Text style={styles.dim}>{quest.description}</Text>
          <View style={{ height: 6 }} />
          <Bar
            value={quest.progress}
            max={quest.target}
            color={quest.completed ? theme.color.accent : theme.color.textDim}
            height={6}
          />
          <Text style={styles.dim}>
            {quest.progress}/{quest.target} · +{quest.seasonXp} season-xp
          </Text>
        </View>
        {quest.claimed ? (
          <Text style={styles.badge}>✓</Text>
        ) : (
          <Button
            label="Ophalen"
            compact
            disabled={!quest.completed}
            loading={pending}
            onPress={onClaim}
          />
        )}
      </Row>
    </Panel>
  );
}

function TrackRow({
  label,
  rewards,
  claimed,
  claimable,
  pending,
  onClaim,
  locked,
}: {
  label: string;
  rewards: RewardDto[];
  claimed: boolean;
  claimable: boolean;
  pending: boolean;
  onClaim: () => void;
  locked?: boolean;
}) {
  if (rewards.length === 0) return null;
  return (
    <Row>
      <Text style={styles.trackLabel}>{label}</Text>
      <Text style={styles.rewards} numberOfLines={1}>
        {rewards.map(rewardLabel).join('  ')}
      </Text>
      {claimed ? (
        <Text style={styles.badge}>✓</Text>
      ) : claimable ? (
        <Button label="Pak" compact loading={pending} onPress={onClaim} />
      ) : locked ? (
        <Text style={styles.locked}>🔒</Text>
      ) : null}
    </Row>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  loading: { flex: 1, backgroundColor: theme.color.bg, alignItems: 'center', justifyContent: 'center' },
  title: { color: theme.color.text, fontSize: 26, fontWeight: '800' },
  subtitle: { color: theme.color.textDim, fontSize: 13, marginTop: 2 },
  tier: { color: theme.color.text, fontSize: 20, fontWeight: '800' },
  dim: { color: theme.color.textDim, fontSize: 12, marginTop: 4 },
  card: { marginBottom: 8 },
  questName: { color: theme.color.text, fontSize: 15, fontWeight: '700' },
  tierCard: { marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  tierNumber: {
    color: theme.color.textDim,
    fontSize: 18,
    fontWeight: '800',
    width: 30,
    textAlign: 'center',
  },
  trackLabel: { color: theme.color.textDim, fontSize: 11, fontWeight: '700', width: 54 },
  rewards: { color: theme.color.text, fontSize: 13, flex: 1 },
  badge: { color: theme.color.accent, fontSize: 16, fontWeight: '800', paddingHorizontal: 10 },
  locked: { fontSize: 14, paddingHorizontal: 10, opacity: 0.5 },
});
