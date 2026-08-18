import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { theme } from '../../src/ui/theme';

function TabIcon({ emoji, color }: { emoji: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{emoji}</Text>;
}

export default function GameLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.accent,
        tabBarInactiveTintColor: theme.color.textDim,
        tabBarStyle: {
          backgroundColor: theme.color.panelSolid,
          borderTopColor: theme.color.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="city"
        options={{
          title: 'Stad',
          tabBarIcon: ({ color }) => <TabIcon emoji="🌆" color={color} />,
        }}
      />
      <Tabs.Screen
        name="base"
        options={{
          title: 'Base',
          tabBarIcon: ({ color }) => <TabIcon emoji="🏠" color={color} />,
        }}
      />
      <Tabs.Screen
        name="craft"
        options={{
          title: 'Werkbank',
          tabBarIcon: ({ color }) => <TabIcon emoji="🪚" color={color} />,
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: 'Winkel',
          tabBarIcon: ({ color }) => <TabIcon emoji="🛒" color={color} />,
        }}
      />
      <Tabs.Screen
        name="pass"
        options={{
          title: 'Seizoen',
          tabBarIcon: ({ color }) => <TabIcon emoji="🎟️" color={color} />,
        }}
      />
      {/* Bereikbaar via je naam op het base-scherm, niet als eigen tab. */}
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
