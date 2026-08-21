import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from './theme';

/**
 * Hoeveel ruimte de zwevende knoppen onderin innemen.
 *
 * De tabbalk reserveerde die ruimte vroeger zelf; nu zweven de knoppen over het
 * scherm en moet de inhoud er onderdoor kunnen scrollen. Zonder dit valt de
 * onderste regel van elk scherm achter de telefoonknop.
 */
export const DOCK_HOOGTE = 62;

/**
 * Een scrollend scherm met de statusbalk netjes afgedekt.
 *
 * `edgeToEdgeEnabled` in app.json laat de app tot achter de statusbalk
 * tekenen. Met alleen `paddingTop: insets.top` staat de inhoud bij scrollstand
 * nul goed, maar zodra je scrolt schuift hij er gewoon onderdoor en loopt je
 * tekst dwars door de klok en het batterij-icoon. Daarom ligt er hier een
 * ondoorzichtige balk overheen ter hoogte van de inkeping.
 *
 * Onderaan is de ruimte bewust `insets.bottom` plus wat lucht: op een toestel
 * met veegbediening viel de laatste knop anders half achter de balk.
 */
export function Screen({
  children,
  refreshControl,
  gap,
}: {
  children: ReactNode;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
  gap?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screenRoot}>
      <ScrollView
        style={styles.screenRoot}
        contentContainerStyle={{
          padding: 14,
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + 40 + DOCK_HOOGTE,
          ...(gap === undefined ? {} : { gap }),
        }}
        refreshControl={refreshControl}
      >
        {children}
      </ScrollView>
      <View style={[styles.statusScrim, { height: insets.top }]} pointerEvents="none" />
    </View>
  );
}

export function Panel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitleText}>{children}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

export function Bar({
  value,
  max,
  color = theme.color.accent,
  height = 8,
}: {
  value: number;
  max: number;
  color?: string;
  height?: number;
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={[styles.barTrack, { height, borderRadius: height / 2 }]}>
      <View
        style={{
          width: `${ratio * 100}%`,
          height: '100%',
          backgroundColor: color,
          borderRadius: height / 2,
        }}
      />
    </View>
  );
}

export function Button({
  label,
  onPress,
  disabled,
  loading,
  tone = 'accent',
  compact,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'accent' | 'ghost' | 'danger';
  compact?: boolean;
}) {
  const background =
    tone === 'accent'
      ? disabled
        ? theme.color.accentDim
        : theme.color.accent
      : tone === 'danger'
        ? theme.color.danger
        : 'transparent';
  const textColor = tone === 'accent' ? '#062018' : theme.color.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        {
          backgroundColor: background,
          borderColor: tone === 'ghost' ? theme.color.border : 'transparent',
          borderWidth: tone === 'ghost' ? 1 : 0,
          opacity: pressed ? 0.75 : disabled ? 0.5 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[styles.buttonText, { color: textColor }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Row({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Empty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: theme.color.bg },
  statusScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.color.bg,
  },
  panel: {
    backgroundColor: theme.color.panel,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    padding: theme.space(3),
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: theme.space(2),
    marginTop: theme.space(3),
  },
  sectionTitleText: {
    color: theme.color.text,
    fontSize: 17,
    fontWeight: '700',
  },
  sectionHint: { color: theme.color.textDim, fontSize: 12 },
  barTrack: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    width: '100%',
  },
  button: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 92,
  },
  buttonCompact: { paddingVertical: 7, paddingHorizontal: 13, minWidth: 0 },
  buttonText: { fontWeight: '700', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2) },
  empty: {
    color: theme.color.textDim,
    fontStyle: 'italic',
    paddingVertical: theme.space(4),
    textAlign: 'center',
  },
});
