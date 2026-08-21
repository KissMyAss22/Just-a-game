import { Tabs, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Phone } from '../../src/ui/Phone';
import { useGame } from '../../src/state/useGame';
import { theme } from '../../src/ui/theme';

/**
 * De navigatie van het spel: twee kleine knoppen in plaats van een tabbalk.
 *
 * `Tabs` blijft eronder liggen, met alleen de balk vervangen. Daardoor houden
 * alle schermen hun eigen toestand en geschiedenis precies zoals ze die hadden
 * — er is geen enkel scherm verbouwd, alleen de manier waarop je er komt.
 *
 * Hier stond een volle strook onderin met een pil erin. Die strook is weg: wat
 * overblijft zweeft over het scherm, zodat de stad tot onderaan doorloopt. Ze
 * staan midden onder, en dat is geen willekeurige keuze — linksonder zit de
 * joystick (`ui/Controls.tsx`) en rechtsonder de snelheidsmeter en de instapknop
 * tijdens het rijden (`ui/HUD.tsx`). Het midden is de enige plek die vrij is.
 */

/**
 * Een telefoontje.
 *
 * Bewust een vórm en geen icoon in een pil: 📱 op een knop is een plaatje van
 * een telefoon, dit ís er een. Het luidsprekerstreepje en het balkje onderaan
 * doen daarvoor het meeste werk — zonder die twee is het een afgerond
 * rechthoekje.
 */
function PhoneShape({ children }: { children?: React.ReactNode }) {
  return (
    <View style={styles.body}>
      <View style={styles.speaker} />
      <View style={styles.display}>{children}</View>
      <View style={styles.home} />
    </View>
  );
}

function BottomButtons() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const devEnabled = useGame((s) => s.devEnabled);
  const [open, setOpen] = useState(false);

  return (
    <>
      <View style={[styles.dock, { bottom: insets.bottom + 10 }]} pointerEvents="box-none">
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityLabel="Telefoon"
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
        >
          <PhoneShape />
        </Pressable>

        {/*
          Alleen als de server het testgereedschap aan heeft staan. Zo ziet een
          speler nooit een knop die niet voor hem is, en staat die regel op één
          plek in plaats van hier én in het scherm erachter.
        */}
        {devEnabled ? (
          <Pressable
            onPress={() => router.push('/(game)/dev')}
            accessibilityLabel="Testgereedschap"
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <PhoneShape>
              <Text style={styles.devIcon}>🔧</Text>
            </PhoneShape>
          </Pressable>
        ) : null}
      </View>
      {open ? <Phone onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export default function GameLayout() {
  return (
    <Tabs
      // Een tabbalk zonder hoogte: de knoppen zijn absoluut geplaatst, dus de
      // schermen eronder lopen door tot de onderrand.
      tabBar={() => <BottomButtons />}
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

const TELEFOON_BREEDTE = 34;
const TELEFOON_HOOGTE = 52;

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 12,
  },
  body: {
    width: TELEFOON_BREEDTE,
    height: TELEFOON_HOOGTE,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    backgroundColor: theme.color.panelSolid,
    paddingHorizontal: 3,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  speaker: {
    width: 10,
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.color.textDim,
  },
  display: {
    flex: 1,
    alignSelf: 'stretch',
    marginVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  home: {
    width: 12,
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.color.textDim,
  },
  devIcon: { fontSize: 15 },
});
