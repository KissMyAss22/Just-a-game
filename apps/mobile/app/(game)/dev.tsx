import {
  ITEMS,
  PARK_CAUSEWAY,
  cellToWorld,
  formatMoney,
  getItem,
  homeAddress,
  parkRect,
  SPECIAL_AREAS,
  specialAreaCenter,
  shopSpots,
  spawnPosition,
} from '@game/shared';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as api from '../../src/net/api';
import { playerPosition, setPlayerPosition } from '../../src/state/position';
import { useGame } from '../../src/state/useGame';
import { WALK_BOOSTS, useSettings } from '../../src/state/useSettings';
import { Button, Panel, Row, Screen, SectionTitle } from '../../src/ui/components';
import { rarityColor, theme } from '../../src/ui/theme';

/**
 * Testgereedschap.
 *
 * Dit scherm hoort niet bij het spel — het bestaat om het spel te kúnnen
 * bekijken. Alles wat hier staat kost normaal uren spelen: een villa, een
 * supercar, een rugzak vol legendarische spullen, een nacht offline-inkomen.
 *
 * De helft werkt alleen als je server met DEV_TOOLS=1 draait; de andere helft
 * (de klok van de stad, de meter) zit puur in de app en werkt altijd.
 */

/** De uren waarop de stad er het interessantst uitziet. */
const HOURS: { label: string; hour: number | null }[] = [
  { label: 'echt', hour: null },
  { label: '06:00', hour: 6 },
  { label: '09:00', hour: 9 },
  { label: '13:00', hour: 13 },
  { label: '18:30', hour: 18.5 },
  { label: '21:00', hour: 21 },
  { label: '01:00', hour: 1 },
];

/**
 * De plekken waar je tijdens het testen steeds naartoe wil.
 *
 * Allemaal afgeleid en niets ingetypt. Een lijst met coördinaten in een scherm
 * is precies wat er stukgaat zodra de kaart verandert — en die is deze maand al
 * twee keer veranderd. Wat hier staat verschuift vanzelf mee.
 */
function namedPlaces(
  propertyId: string | undefined,
  seed: number | undefined,
): { key: string; label: string; x: number; z: number }[] {
  const out = [{ key: 'spawn', label: 'Startpunt', ...spawnPosition() }];

  for (const shop of shopSpots()) {
    out.push({ key: shop.id, label: shop.name, x: shop.x, z: shop.z });
  }

  if (propertyId !== undefined && seed !== undefined) {
    const thuis = homeAddress(propertyId, seed);
    if (thuis) out.push({ key: 'thuis', label: 'Je voordeur', x: thuis.x, z: thuis.z });
  }

  // Het stadspark en het marktplein: de twee plekken in de stad die geen
  // bouwblok zijn. Zonder deze twee is die ronde alleen te voet te bekijken.
  for (const vak of SPECIAL_AREAS) {
    out.push({ key: vak.id, label: vak.name, ...specialAreaCenter(vak) });
  }

  const park = parkRect();
  out.push({
    key: 'park',
    label: 'Het Verlaten Park',
    x: (park.minX + park.maxX) / 2,
    z: (park.minZ + park.maxZ) / 2,
  });

  // Het middelpunt van de landtong: de enige doorgang naar het park.
  const west = cellToWorld(PARK_CAUSEWAY.x0, PARK_CAUSEWAY.z0);
  const oost = cellToWorld(PARK_CAUSEWAY.x1 - 1, PARK_CAUSEWAY.z1 - 1);
  out.push({
    key: 'landtong',
    label: 'De landtong',
    x: (west.x + oost.x) / 2,
    z: (west.z + oost.z) / 2,
  });

  return out;
}

const CASH_STEPS = [10_000, 250_000, 5_000_000];
const LEVELS = [1, 5, 10, 20, 35, 50];
const SKIPS = [1, 8, 24];

/** Een rijtje kleine keuzeknoppen. */
function Choices<T>({
  options,
  selected,
  onSelect,
  label,
}: {
  options: { key: string; label: string; value: T }[];
  selected?: string;
  onSelect: (value: T) => void;
  label?: string;
}) {
  return (
    <View>
      {label ? <Text style={styles.hint}>{label}</Text> : null}
      <View style={styles.choiceRow}>
        {options.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => onSelect(option.value)}
            style={({ pressed }) => [
              styles.choice,
              option.key === selected && styles.choiceActive,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text
              style={[styles.choiceLabel, option.key === selected && styles.choiceLabelActive]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function DevScreen() {
  const router = useRouter();
  const applyState = useGame((s) => s.applyState);
  const toast = useGame((s) => s.toast);
  const syncSpawns = useGame((s) => s.syncSpawns);
  const state = useGame((s) => s.state);

  const devHour = useSettings((s) => s.devHour);
  const setDevHour = useSettings((s) => s.setDevHour);
  const debugOverlay = useSettings((s) => s.debugOverlay);
  const setDebugOverlay = useSettings((s) => s.setDebugOverlay);
  const walkBoost = useSettings((s) => s.walkBoost);
  const setWalkBoost = useSettings((s) => s.setWalkBoost);
  const fly = useSettings((s) => s.fly);
  const setFly = useSettings((s) => s.setFly);
  const mapTeleport = useSettings((s) => s.mapTeleport);
  const setMapTeleport = useSettings((s) => s.setMapTeleport);

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [options, setOptions] = useState<{
    districts: { id: string; name: string; unlockLevel: number }[];
    properties: { id: string; name: string; tier: number }[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [amount, setAmount] = useState('10');
  const [teleX, setTeleX] = useState('');
  const [teleZ, setTeleZ] = useState('');

  const places = useMemo(
    () => namedPlaces(state?.player.propertyId, state?.player.seed),
    [state?.player.propertyId, state?.player.seed],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const status = await api.fetchDevStatus();
        if (!alive) return;
        setEnabled(status.enabled);
        if (!status.enabled) return;
        const loaded = await api.fetchDevOptions();
        if (alive) setOptions(loaded);
      } catch {
        if (alive) setEnabled(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Eén plek waar alles doorheen gaat: bezig-vlag, foutmelding en melding.
   * Zonder dit staat er bij elke knop dezelfde vijf regels try/catch.
   */
  const run = useCallback(
    async (what: string, action: () => Promise<string | void>) => {
      setBusy(true);
      try {
        const message = await action();
        toast(message ?? what);
      } catch (error) {
        const detail = error instanceof api.ApiError ? error.message : String(error);
        toast(`${what} mislukt`, detail);
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  /**
   * Springen naar een plek, een coördinaat of een wijk.
   *
   * De server kiest met `nearestWalkable` de dichtstbijzijnde begaanbare grond,
   * dus je landt nooit in een muur of in het water. Dat is geen anti-cheat maar
   * gezond verstand: een teleport die je klem zet is geen gereedschap.
   */
  const jump = useCallback(
    (target: { x?: number; z?: number; districtId?: string }) =>
      run('Verplaatst', async () => {
        const spot = await api.devTeleport(target);
        // De 3D-wereld leest deze positie rechtstreeks; zo sta je er meteen
        // zodra je terug bent op het stadsscherm.
        setPlayerPosition(spot.x, spot.z);
        await syncSpawns();
        return `Je staat nu op ${Math.round(spot.x)}, ${Math.round(spot.z)}`;
      }),
    [run, syncSpawns],
  );

  const query = search.trim().toLowerCase();
  const matches = query
    ? ITEMS.filter((item) => item.name.toLowerCase().includes(query)).slice(0, 8)
    : [];
  const quantity = Math.max(1, Math.min(999, Math.round(Number(amount) || 1)));

  return (
    <Screen gap={theme.space(3)}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={styles.title}>Testgereedschap</Text>
        <Button label="Terug" tone="ghost" compact onPress={() => router.back()} />
      </Row>

      {enabled === false ? (
        <Panel style={styles.warning}>
          <Text style={styles.warningTitle}>De server doet niet mee</Text>
          <Text style={styles.note}>
            Zet <Text style={styles.code}>DEV_TOOLS=1</Text> in{' '}
            <Text style={styles.code}>apps/server/.env</Text> en herstart de server. Zonder dat
            weigert hij alles hieronder — en terecht: dit zijn gratis-geldknoppen.
            {'\n\n'}
            De klok en de meter onderaan werken wel gewoon; die zitten in de app.
          </Text>
        </Panel>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      <SectionTitle hint="in de app">Uur van de dag</SectionTitle>
      <Panel>
        <Choices
          options={HOURS.map((h) => ({ key: String(h.hour), label: h.label, value: h.hour }))}
          selected={String(devHour)}
          onSelect={(hour) => void setDevHour(hour)}
        />
        <Text style={styles.note}>
          Zet de dag- en nachtcyclus stil op een vast uur. Handig om de straatverlichting en de
          gevels bij avondlicht te bekijken zonder tot vanavond te wachten. "echt" geeft de klok
          van je telefoon terug.
        </Text>
      </Panel>

      <SectionTitle hint="in de app">Bewegen</SectionTitle>
      <Panel>
        <Choices
          label="Loopsnelheid"
          options={WALK_BOOSTS.map((boost) => ({
            key: String(boost),
            label: `${boost}×`,
            value: boost,
          }))}
          selected={String(walkBoost)}
          onSelect={(boost) => void setWalkBoost(boost)}
        />

        <View style={{ height: 12 }} />
        <Button
          label={fly ? '🛩️ Vliegmodus staat aan' : 'Vliegmodus'}
          tone={fly ? 'accent' : 'ghost'}
          onPress={() => void setFly(!fly)}
        />
        <Text style={styles.note}>
          Vliegen gaat dwars door gebouwen heen; met de pijlen rechts in beeld ga je omhoog en
          omlaag. Handig om de stad van boven te bekijken en om te zien waar hij ophoudt.
          {'\n\n'}
          Loopsnelheid en vliegen zitten in de app, maar de server telt wel mee hoe hard je
          gaat. Zonder DEV_TOOLS=1 duwt de snelheidscontrole je gewoon terug — die staat er
          niet voor niets.
        </Text>
      </Panel>

      <SectionTitle hint="in de app">Meter over het beeld</SectionTitle>
      <Panel>
        <Button
          label={debugOverlay ? '📊 Meter staat aan' : 'Meter aanzetten'}
          tone={debugOverlay ? 'accent' : 'ghost'}
          onPress={() => void setDebugOverlay(!debugOverlay)}
        />
        <Text style={styles.note}>
          Toont beeldjes per seconde, tekenopdrachten, driehoeken en je positie. Tekenopdrachten
          zijn de beste maat voor "waarom is dit traag": boven de 150 begint een telefoon te
          zuchten.
        </Text>
      </Panel>

      {/* ---------------------------------------------------------------- */}
      <SectionTitle hint="server">Items</SectionTitle>
      <Panel>
        <Row style={{ gap: 8, alignItems: 'center' }}>
          <Text style={styles.hint}>Aantal</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
            style={styles.amount}
            maxLength={3}
          />
          <View style={{ flex: 1 }}>
            <Button
              label={`Alle ${ITEMS.length} items ×${quantity}`}
              loading={busy}
              disabled={!enabled}
              onPress={() =>
                void run('Items gegeven', async () => {
                  const result = await api.devGiveItems(quantity);
                  applyState(result.state);
                  return `${result.given} items erbij (${result.kinds} soorten)`;
                })
              }
            />
          </View>
        </Row>

        <View style={{ height: 12 }} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Zoek één item op naam…"
          placeholderTextColor={theme.color.textDim}
          style={styles.input}
        />
        {matches.map((item) => (
          <Pressable
            key={item.id}
            disabled={!enabled || busy}
            onPress={() =>
              void run('Item gegeven', async () => {
                const result = await api.devGiveItems(quantity, item.id);
                applyState(result.state);
                return `${quantity}× ${getItem(item.id).name}`;
              })
            }
            style={({ pressed }) => [styles.itemRow, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.itemIcon}>{item.icon}</Text>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={[styles.rarityDot, { backgroundColor: rarityColor[item.rarity] }]} />
          </Pressable>
        ))}
      </Panel>

      {/* ---------------------------------------------------------------- */}
      <SectionTitle hint="server">Geld en level</SectionTitle>
      <Panel>
        <Choices
          label="Cash erbij"
          options={CASH_STEPS.map((step) => ({
            key: String(step),
            label: formatMoney(step),
            value: step,
          }))}
          onSelect={(cash) =>
            void run('Cash bijgeschreven', async () => {
              applyState(await api.devCurrency({ cash }));
              return `${formatMoney(cash)} erbij`;
            })
          }
        />
        <View style={{ height: 10 }} />
        <Choices
          label="Gems erbij"
          options={[100, 1_000, 10_000].map((step) => ({
            key: String(step),
            label: `💎 ${step}`,
            value: step,
          }))}
          onSelect={(gems) =>
            void run('Gems bijgeschreven', async () => {
              applyState(await api.devCurrency({ gems }));
              return `${gems} gems erbij`;
            })
          }
        />
        <View style={{ height: 10 }} />
        <Choices
          label="Level zetten"
          options={LEVELS.map((level) => ({
            key: String(level),
            label: `lvl ${level}`,
            value: level,
          }))}
          selected={state ? String(state.player.level) : undefined}
          onSelect={(level) =>
            void run('Level gezet', async () => {
              applyState(await api.devLevel(level));
              return `Je bent nu level ${level}`;
            })
          }
        />
        <Text style={styles.note}>
          Springen naar een level keert de levelbeloningen bewust níét uit, en bijgeschreven cash
          telt niet mee voor je levenslange opbrengst. Anders klopt de rebirth-formule daarna
          nergens meer.
        </Text>
      </Panel>

      {/* ---------------------------------------------------------------- */}
      <SectionTitle hint="server">Bezit</SectionTitle>
      <Panel>
        <Button
          label="Alle voertuigen ontgrendelen"
          loading={busy}
          disabled={!enabled}
          onPress={() =>
            void run('Voertuigen ontgrendeld', async () => {
              applyState(await api.devUnlock({ vehicles: true }));
              return 'Alle voertuigen staan in de winkel op "in bezit"';
            })
          }
        />
        <View style={{ height: 10 }} />
        <Choices
          label="Woning"
          options={(options?.properties ?? []).map((property) => ({
            key: property.id,
            label: property.name,
            value: property.id,
          }))}
          selected={state?.player.propertyId}
          onSelect={(propertyId) =>
            void run('Woning gewisseld', async () => {
              applyState(await api.devUnlock({ vehicles: false, propertyId }));
              return 'Bekijk hem op het base-scherm';
            })
          }
        />
      </Panel>

      {/* ---------------------------------------------------------------- */}
      <SectionTitle hint="server">Verplaatsen</SectionTitle>
      <Panel>
        <Choices
          label="Spring naar een plek"
          options={places.map((place) => ({
            key: place.key,
            label: place.label,
            value: place,
          }))}
          onSelect={(place) => void jump({ x: place.x, z: place.z })}
        />

        <View style={{ height: 12 }} />
        <Text style={styles.hint}>Naar een coördinaat</Text>
        <Row style={{ gap: 8, alignItems: 'center' }}>
          <TextInput
            value={teleX}
            onChangeText={setTeleX}
            keyboardType="numbers-and-punctuation"
            placeholder="x"
            placeholderTextColor={theme.color.textDim}
            style={[styles.input, { flex: 1 }]}
          />
          <TextInput
            value={teleZ}
            onChangeText={setTeleZ}
            keyboardType="numbers-and-punctuation"
            placeholder="z"
            placeholderTextColor={theme.color.textDim}
            style={[styles.input, { flex: 1 }]}
          />
          <Button
            label="Ga"
            compact
            disabled={!Number.isFinite(Number(teleX)) || !Number.isFinite(Number(teleZ))}
            onPress={() => void jump({ x: Number(teleX), z: Number(teleZ) })}
          />
        </Row>
        <Text style={styles.note}>
          Je hoeft geen begaanbare plek te raken: de server zet je op de dichtstbijzijnde
          stoep of berm. Je huidige plek staat op {Math.round(playerPosition.x)},{' '}
          {Math.round(playerPosition.z)}.
        </Text>

        <View style={{ height: 12 }} />
        <Button
          label={mapTeleport ? '🗺️ Tikken op de kaart springt' : 'Tikken op de kaart laten springen'}
          tone={mapTeleport ? 'accent' : 'ghost'}
          onPress={() => void setMapTeleport(!mapTeleport)}
        />
        <Text style={styles.note}>
          Staat dit aan, dan brengt een tik op de kaart in je telefoon je daarheen. Staat het
          uit, dan doet de kaart precies wat hij altijd deed — dat is met opzet, want de kaart
          is ook een scherm dat je gewoon opent om te kijken waar je bent.
        </Text>

        <View style={{ height: 12 }} />
        <Choices
          label="Spring naar een wijk"
          options={(options?.districts ?? []).map((district) => ({
            key: district.id,
            label: district.name,
            value: district.id,
          }))}
          onSelect={(districtId) => void jump({ districtId })}
        />
        <View style={{ height: 10 }} />
        <Button
          label="Leg 12 items om me heen"
          tone="ghost"
          loading={busy}
          disabled={!enabled}
          onPress={() =>
            void run('Items neergelegd', async () => {
              const result = await api.devSpawn(playerPosition.x, playerPosition.z, 12);
              await syncSpawns();
              return `${result.created} items op straat`;
            })
          }
        />
      </Panel>

      {/* ---------------------------------------------------------------- */}
      <SectionTitle hint="server">Tijd</SectionTitle>
      <Panel>
        <Choices
          label="Kluisklok vooruit"
          options={SKIPS.map((hours) => ({
            key: String(hours),
            label: `${hours} uur`,
            value: hours,
          }))}
          onSelect={(hours) =>
            void run('Tijd vooruitgezet', async () => {
              const result = await api.devTimeSkip(hours);
              applyState(result.state);
              return result.cappedByTime
                ? `${formatMoney(result.earned)} — afgetopt op je offline-limiet`
                : `${formatMoney(result.earned)} bijgeschreven`;
            })
          }
        />
        <Text style={styles.note}>
          Dit verzet niet de echte tijd, alleen het moment waarop je kluis voor het laatst is
          afgerekend. De gewone berekening doet de rest, inclusief offline-limiet en kluisplafond
          — je test dus de échte formule.
        </Text>
      </Panel>

      {/* ---------------------------------------------------------------- */}
      <SectionTitle hint="server">Opnieuw beginnen</SectionTitle>
      <Panel>
        <Button
          label="Alles wissen en als nieuwe speler starten"
          tone="danger"
          loading={busy}
          disabled={!enabled}
          onPress={() =>
            void run('Gereset', async () => {
              applyState(await api.devReset());
              setPlayerPosition(0, 0);
              return 'Terug naar level 1, lege rugzak, krot';
            })
          }
        />
        <Text style={styles.note}>
          Wist ook je erfenis en je levenslange opbrengst — anders ben je geen nieuwe speler maar
          een nieuwe speler met voorsprong. Het grootboek blijft staan.
        </Text>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.color.text, fontSize: 26, fontWeight: '800' },
  hint: { color: theme.color.textDim, fontSize: 12, fontWeight: '700' },
  note: { color: theme.color.textDim, fontSize: 12, marginTop: 10, lineHeight: 17 },
  code: { color: theme.color.accent, fontWeight: '700' },
  warning: { borderColor: theme.color.danger },
  warningTitle: { color: theme.color.danger, fontSize: 15, fontWeight: '800' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  choice: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  choiceActive: {
    borderColor: theme.color.accent,
    backgroundColor: 'rgba(77, 212, 172, 0.14)',
  },
  choiceLabel: { color: theme.color.textDim, fontWeight: '700', fontSize: 13 },
  choiceLabelActive: { color: theme.color.accent },
  amount: {
    color: theme.color.text,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minWidth: 58,
    textAlign: 'center',
  },
  input: {
    color: theme.color.text,
    fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  itemIcon: { fontSize: 18 },
  itemName: { color: theme.color.text, fontSize: 14, fontWeight: '600', flex: 1 },
  rarityDot: { width: 9, height: 9, borderRadius: 5 },
});
