import {
  ACCENT_COLORS,
  DEFAULT_APPEARANCE,
  DISPLAY_NAME_MAX,
  NAME_PROBLEM_MESSAGE,
  OUTFIT_COLORS,
  SKIN_TONES,
  formatMoney,
  getProperty,
  getVehicle,
  validateDisplayName,
  type Appearance,
} from '@game/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '../../src/state/useGame';
import { Button, Panel, Row, SectionTitle } from '../../src/ui/components';
import { theme } from '../../src/ui/theme';

function Swatches({
  colors,
  selected,
  onSelect,
}: {
  colors: readonly string[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  return (
    <View style={styles.swatchRow}>
      {colors.map((color, index) => (
        <Pressable
          key={color}
          onPress={() => onSelect(index)}
          style={({ pressed }) => [
            styles.swatch,
            { backgroundColor: color },
            index === selected && styles.swatchSelected,
            pressed && { opacity: 0.7 },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * Je personage. Dit is de eerste roleplay-laag: de naam en het uiterlijk die
 * andere spelers straks van je zien als jullie in dezelfde stad lopen.
 */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const state = useGame((s) => s.state);
  const busy = useGame((s) => s.busy);
  const saveProfile = useGame((s) => s.saveProfile);

  const [name, setName] = useState(state?.player.displayName ?? '');
  const [appearance, setAppearance] = useState<Appearance>(
    state?.player.appearance ?? DEFAULT_APPEARANCE,
  );

  if (!state) return null;

  const check = validateDisplayName(name);
  const nameProblem = check.ok ? null : NAME_PROBLEM_MESSAGE[check.problem];
  const nameChanged = check.ok && check.name !== state.player.displayName;
  const lookChanged =
    appearance.skin !== state.player.appearance.skin ||
    appearance.outfit !== state.player.appearance.outfit ||
    appearance.accent !== state.player.appearance.accent;

  const save = async () => {
    const ok = await saveProfile({
      displayName: nameChanged ? check.name : undefined,
      appearance: lookChanged ? appearance : undefined,
    });
    if (ok) router.back();
  };

  const property = getProperty(state.player.propertyId);
  const vehicle = getVehicle(state.player.vehicleId);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 14, paddingTop: insets.top + 10, paddingBottom: 40 }}
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={styles.title}>Je personage</Text>
        <Button label="Terug" tone="ghost" compact onPress={() => router.back()} />
      </Row>

      {/* Voorbeeld van hoe je eruitziet, in dezelfde kleuren als in de stad. */}
      <Panel style={{ marginTop: 12, alignItems: 'center', paddingVertical: 22 }}>
        <View style={[styles.avatarHat, { backgroundColor: ACCENT_COLORS[appearance.accent] }]} />
        <View style={[styles.avatarHead, { backgroundColor: SKIN_TONES[appearance.skin] }]} />
        <View style={[styles.avatarBody, { backgroundColor: OUTFIT_COLORS[appearance.outfit] }]} />
        <Text style={styles.previewName}>{check.ok ? check.name : state.player.displayName}</Text>
        <Text style={styles.dim}>
          level {state.player.level} · {property.icon} {property.name} · {vehicle.icon}{' '}
          {vehicle.name}
        </Text>
        <Text style={styles.dim}>Flex Score {formatMoney(state.stats.flexScore)}</Text>
      </Panel>

      <SectionTitle hint={`${name.length}/${DISPLAY_NAME_MAX}`}>Naam</SectionTitle>
      <Panel>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={DISPLAY_NAME_MAX + 6}
          placeholder="Hoe heet je?"
          placeholderTextColor={theme.color.textDim}
          style={styles.input}
          autoCorrect={false}
        />
        {nameProblem ? <Text style={styles.problem}>{nameProblem}</Text> : null}
        <Text style={styles.dim}>
          Andere spelers zien deze naam zodra je ze in de stad tegenkomt.
        </Text>
      </Panel>

      <SectionTitle>Huidskleur</SectionTitle>
      <Panel>
        <Swatches
          colors={SKIN_TONES}
          selected={appearance.skin}
          onSelect={(skin) => setAppearance((a) => ({ ...a, skin }))}
        />
      </Panel>

      <SectionTitle>Kleding</SectionTitle>
      <Panel>
        <Swatches
          colors={OUTFIT_COLORS}
          selected={appearance.outfit}
          onSelect={(outfit) => setAppearance((a) => ({ ...a, outfit }))}
        />
      </Panel>

      <SectionTitle>Pet</SectionTitle>
      <Panel>
        <Swatches
          colors={ACCENT_COLORS}
          selected={appearance.accent}
          onSelect={(accent) => setAppearance((a) => ({ ...a, accent }))}
        />
      </Panel>

      <View style={{ height: 16 }} />
      <Button
        label="Opslaan"
        loading={busy}
        disabled={(!nameChanged && !lookChanged) || !check.ok}
        onPress={() => void save()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  title: { color: theme.color.text, fontSize: 26, fontWeight: '800' },
  dim: { color: theme.color.textDim, fontSize: 12, marginTop: 4, textAlign: 'center' },
  avatarHat: { width: 46, height: 12, borderRadius: 5 },
  avatarHead: { width: 40, height: 40, borderRadius: 20, marginTop: -2 },
  avatarBody: { width: 52, height: 62, borderRadius: 24, marginTop: -6 },
  previewName: { color: theme.color.text, fontSize: 19, fontWeight: '800', marginTop: 10 },
  input: {
    color: theme.color.text,
    fontSize: 17,
    fontWeight: '600',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  problem: { color: theme.color.danger, fontSize: 12, marginTop: 6 },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: { borderColor: theme.color.text, transform: [{ scale: 1.08 }] },
});
