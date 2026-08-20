import { formatMoney } from '@game/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import * as api from '../../src/net/api';
import { useGame } from '../../src/state/useGame';
import { Bar, Button, Panel, Row, Screen, SectionTitle } from '../../src/ui/components';
import { theme } from '../../src/ui/theme';

/**
 * Rebirth is de enige actie in het spel die voortgang weggooit. Dit scherm
 * toont daarom eerst letterlijk wat je kwijtraakt en wat je houdt — beide
 * lijsten komen van de server, dus ze kunnen nooit uit de pas lopen met wat
 * er echt gebeurt.
 */
export default function RebirthScreen() {
  const router = useRouter();
  const busy = useGame((s) => s.busy);
  const rebirth = useGame((s) => s.rebirth);
  const buyLegacyPerk = useGame((s) => s.buyLegacyPerk);
  const toast = useGame((s) => s.toast);
  const [info, setInfo] = useState<api.RebirthResponse | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInfo(await api.fetchRebirth());
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Laden mislukt');
    }
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!info) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.color.accent} />
      </View>
    );
  }

  const confirmRebirth = () => {
    Alert.alert(
      'Weet je het zeker?',
      `Je begint helemaal opnieuw en krijgt ${info.pending} erfenis. Je geld, level, woning, voertuigen, upgrades en spullen zijn weg. Dit kan niet ongedaan gemaakt worden.`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: `Rebirth voor ${info.pending}`,
          style: 'destructive',
          onPress: async () => {
            if (await rebirth()) await load();
          },
        },
      ],
    );
  };

  const bonusLines = [
    info.bonuses.income > 1 ? `+${Math.round((info.bonuses.income - 1) * 100)}% inkomen` : null,
    info.bonuses.sell > 1 ? `+${Math.round((info.bonuses.sell - 1) * 100)}% verkoop` : null,
    info.bonuses.xp > 1 ? `+${Math.round((info.bonuses.xp - 1) * 100)}% ervaring` : null,
    info.bonuses.offlineCapHours > 0 ? `+${info.bonuses.offlineCapHours} u offline` : null,
    info.bonuses.moveSpeed > 1
      ? `+${Math.round((info.bonuses.moveSpeed - 1) * 100)}% snelheid`
      : null,
    info.bonuses.headstartCash > 0
      ? `${formatMoney(info.bonuses.headstartCash)} startkapitaal`
      : null,
  ].filter(Boolean) as string[];

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={styles.title}>Rebirth</Text>
        <Button label="Terug" tone="ghost" compact onPress={() => router.back()} />
      </Row>

      <Panel style={{ marginTop: 12 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Text style={styles.dim}>Erfenis te besteden</Text>
            <Text style={styles.erfenis}>🏛️ {formatMoney(info.erfenis)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.dim}>Rebirths</Text>
            <Text style={styles.count}>{info.rebirthCount}</Text>
          </View>
        </Row>
        {bonusLines.length > 0 ? (
          <Text style={styles.bonusText}>Nu actief: {bonusLines.join(' · ')}</Text>
        ) : (
          <Text style={styles.dim}>
            Nog geen permanente voordelen. Die koop je hieronder met erfenis.
          </Text>
        )}
      </Panel>

      <SectionTitle hint={info.canRebirth ? 'klaar' : 'nog niet'}>Volgende rebirth</SectionTitle>
      <Panel>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={styles.label}>Levert nu op</Text>
          <Text style={styles.reward}>🏛️ {info.pending}</Text>
        </Row>

        <View style={{ height: 10 }} />
        <Text style={styles.label}>
          Level {info.level} van {info.requiredLevel}
        </Text>
        <Bar
          value={Math.min(info.level, info.requiredLevel)}
          max={info.requiredLevel}
          color={info.hasLevel ? theme.color.accent : theme.color.textDim}
          height={6}
        />

        <View style={{ height: 10 }} />
        <Text style={styles.label}>
          Levenslang verdiend {formatMoney(info.lifetimeEarned)} van{' '}
          {formatMoney(info.earningsNeeded)}
        </Text>
        <Bar
          value={Math.min(info.lifetimeEarned, info.earningsNeeded)}
          max={info.earningsNeeded}
          color={info.hasGain ? theme.color.accent : theme.color.textDim}
          height={6}
        />

        <View style={{ height: 14 }} />
        <Button
          label={info.canRebirth ? `Rebirth voor ${info.pending} erfenis` : 'Nog niet mogelijk'}
          tone={info.canRebirth ? 'danger' : 'ghost'}
          disabled={!info.canRebirth}
          loading={busy}
          onPress={confirmRebirth}
        />
      </Panel>

      <SectionTitle>Dit raak je kwijt</SectionTitle>
      <Panel>
        {info.resets.map((line) => (
          <Text key={line} style={styles.resetLine}>
            ✕ {line}
          </Text>
        ))}
      </Panel>

      <SectionTitle>Dit houd je</SectionTitle>
      <Panel>
        {info.keeps.map((line) => (
          <Text key={line} style={styles.keepLine}>
            ✓ {line}
          </Text>
        ))}
      </Panel>

      <SectionTitle hint="voor altijd">Erfenis uitgeven</SectionTitle>
      {info.perks.map((perk) => (
        <Panel key={perk.id} style={styles.card}>
          <Row>
            <Text style={styles.icon}>{perk.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {perk.name}{' '}
                <Text style={styles.dim}>
                  {perk.level}/{perk.maxLevel}
                </Text>
              </Text>
              <Text style={styles.dim}>{perk.description}</Text>
            </View>
            <Button
              label={perk.cost === null ? 'Max' : `🏛️ ${perk.cost}`}
              compact
              disabled={perk.cost === null || !perk.affordable}
              loading={pending === perk.id && busy}
              onPress={async () => {
                setPending(perk.id);
                if (await buyLegacyPerk(perk.id)) await load();
                setPending(null);
              }}
            />
          </Row>
        </Panel>
      ))}
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
  dim: { color: theme.color.textDim, fontSize: 12, marginTop: 4 },
  label: { color: theme.color.textDim, fontSize: 12, marginBottom: 4 },
  erfenis: { color: theme.color.xp, fontSize: 26, fontWeight: '800' },
  count: { color: theme.color.text, fontSize: 26, fontWeight: '800' },
  reward: { color: theme.color.xp, fontSize: 20, fontWeight: '800' },
  bonusText: { color: theme.color.accent, fontSize: 12, marginTop: 8, lineHeight: 18 },
  resetLine: { color: theme.color.danger, fontSize: 13, paddingVertical: 3 },
  keepLine: { color: theme.color.accent, fontSize: 13, paddingVertical: 3 },
  card: { marginBottom: 8 },
  icon: { fontSize: 26, width: 34, textAlign: 'center' },
  name: { color: theme.color.text, fontSize: 16, fontWeight: '700' },
});
