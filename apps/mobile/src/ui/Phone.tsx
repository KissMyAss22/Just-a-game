import { formatMoney } from '@game/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '../state/useGame';
import { worldClock } from '../state/devWorld';
import { currentHour } from '../game3d/city/sky';
import { MapApp } from './phone/MapApp';
import { NearbyApp } from './phone/NearbyApp';
import { PHONE_APPS, type PhoneAppDef, type PhoneAppId } from './phone/apps';
import { theme } from './theme';

/**
 * De telefoon: het menu van het spel.
 *
 * Een tabbalk met vijf tabs zat vol, en er komt nog van alles bij — een bank,
 * berichten, een voertuig laten voorrijden. Als telefoon is er ruimte voor,
 * en het past bij een spel waarin je door een stad loopt.
 *
 * De schermen zelf zijn níét verhuisd. De telefoon navigeert naar dezelfde
 * routes als de tabbalk deed, dus alles wat er stond werkt nog precies zoals
 * het werkte. Alleen Kaart en In de buurt openen ín de telefoon: die hebben
 * geen heel scherm nodig.
 */

/** De tijd in de stad, in de vorm die op een telefoon staat. */
function cityTime(): string {
  const hour = worldClock.hour ?? currentHour();
  const whole = Math.floor(hour);
  const minutes = Math.floor((hour - whole) * 60);
  return `${String(whole).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function AppIcon({
  app,
  locked,
  onPress,
}: {
  app: PhoneAppDef;
  locked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={locked ? undefined : onPress}
      style={({ pressed }) => [styles.app, pressed && !locked && { opacity: 0.65 }]}
    >
      <View style={[styles.appTile, locked && styles.appTileLocked]}>
        <Text style={[styles.appIcon, locked && { opacity: 0.35 }]}>{app.icon}</Text>
      </View>
      <Text style={[styles.appName, locked && { color: theme.color.textDim }]} numberOfLines={1}>
        {app.name}
      </Text>
      {locked ? <Text style={styles.appLocked}>lvl {app.requiredLevel}</Text> : null}
    </Pressable>
  );
}

export function Phone({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const state = useGame((s) => s.state);
  const [open, setOpen] = useState<PhoneAppId | null>(null);

  const level = state?.player.level ?? 1;
  const inPhone = PHONE_APPS.find((app) => app.id === open);

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.phone}>
          {/* Statusregel, zoals op een echte telefoon. */}
          <View style={styles.status}>
            <Text style={styles.statusText}>{cityTime()}</Text>
            <View style={{ flex: 1 }} />
            {state ? (
              <>
                <Text style={[styles.statusText, { color: theme.color.cash }]}>
                  {formatMoney(state.player.cash)}
                </Text>
                <Text style={[styles.statusText, { color: theme.color.gems }]}>
                  💎 {state.player.gems}
                </Text>
              </>
            ) : null}
          </View>

          <ScrollView contentContainerStyle={styles.screen}>
            {inPhone && !inPhone.route ? (
              <>
                <Pressable onPress={() => setOpen(null)} style={styles.back}>
                  <Text style={styles.backText}>‹ apps</Text>
                </Pressable>
                <Text style={styles.appTitle}>
                  {inPhone.icon} {inPhone.name}
                </Text>
                {open === 'map' ? <MapApp /> : null}
                {open === 'nearby' ? <NearbyApp /> : null}
              </>
            ) : (
              <View style={styles.grid}>
                {PHONE_APPS.map((app) => (
                  <AppIcon
                    key={app.id}
                    app={app}
                    locked={app.requiredLevel !== undefined && level < app.requiredLevel}
                    onPress={() => {
                      if (!app.route) {
                        setOpen(app.id);
                        return;
                      }
                      // Een scherm buiten de telefoon: sluiten en erheen.
                      // `navigate` en niet `push`, want dit zijn tabbladen —
                      // pushen zou hetzelfde scherm opstapelen.
                      onClose();
                      router.navigate(app.route as never);
                    }}
                  />
                ))}
              </View>
            )}
          </ScrollView>

          <Pressable onPress={onClose} style={styles.home}>
            <View style={styles.homeBar} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 7, 16, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  phone: {
    flex: 1,
    width: '100%',
    maxWidth: 380,
    backgroundColor: theme.color.bgSoft,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#2b3550',
    overflow: 'hidden',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
  },
  statusText: { color: theme.color.text, fontSize: 12, fontWeight: '800' },
  screen: { padding: 16, paddingBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  app: { width: '33.33%', alignItems: 'center', paddingVertical: 12 },
  appTile: {
    width: 62,
    height: 62,
    borderRadius: 18,
    backgroundColor: theme.color.panelSolid,
    borderWidth: 1,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTileLocked: { borderStyle: 'dashed' },
  appIcon: { fontSize: 28 },
  appName: { color: theme.color.text, fontSize: 12, fontWeight: '700', marginTop: 7 },
  appLocked: { color: theme.color.textDim, fontSize: 10, marginTop: 1 },
  back: { paddingVertical: 4, alignSelf: 'flex-start' },
  backText: { color: theme.color.accent, fontSize: 14, fontWeight: '700' },
  appTitle: { color: theme.color.text, fontSize: 20, fontWeight: '800', marginBottom: 14 },
  home: { alignItems: 'center', paddingVertical: 12 },
  homeBar: { width: 110, height: 5, borderRadius: 3, backgroundColor: 'rgba(232,237,249,0.4)' },
});
