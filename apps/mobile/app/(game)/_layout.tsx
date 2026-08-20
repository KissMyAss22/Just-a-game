import { Tabs } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Phone } from '../../src/ui/Phone';
import { theme } from '../../src/ui/theme';

/**
 * De navigatie van het spel: één telefoonknop in plaats van een tabbalk.
 *
 * `Tabs` blijft eronder liggen, met alleen de balk vervangen. Daardoor houden
 * alle schermen hun eigen toestand en geschiedenis precies zoals ze die hadden
 * — er is geen enkel scherm verbouwd, alleen de manier waarop je er komt.
 */
function PhoneBar() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  return (
    <>
      <View style={[styles.bar, { paddingBottom: insets.bottom + 8 }]}>
        <Pressable
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.icon}>📱</Text>
          <Text style={styles.label}>Telefoon</Text>
        </Pressable>
      </View>
      {open ? <Phone onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export default function GameLayout() {
  return (
    <Tabs
      tabBar={() => <PhoneBar />}
      screenOptions={{ headerShown: false }}
    >
      {/* De stad is het spel; de rest bereik je via de telefoon. */}
      <Tabs.Screen name="city" />
      <Tabs.Screen name="base" />
      <Tabs.Screen name="craft" />
      <Tabs.Screen name="shop" />
      <Tabs.Screen name="pass" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="rebirth" />
      <Tabs.Screen name="interior" />
      <Tabs.Screen name="dev" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: theme.color.panelSolid,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
    paddingTop: 8,
    alignItems: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 26,
    paddingVertical: 9,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  icon: { fontSize: 19 },
  label: { color: theme.color.text, fontSize: 14, fontWeight: '800' },
});
