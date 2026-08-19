import { useFrame, useThree } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef } from 'react';
import { createLootField } from './city/loot';
import { playerPosition } from '../state/position';
import { rarityColor } from '../ui/theme';
import { useGame } from '../state/useGame';

/** Minimale tijd tussen twee oppak-verzoeken, zodat we de server niet spammen. */
const PICKUP_COOLDOWN_MS = 420;

/**
 * Alles wat er op straat ligt. Het tekenwerk zit in city/loot.ts; hier staat
 * alleen wanneer er iets opgeraapt wordt.
 */
export function SpawnField() {
  const { scene } = useThree();
  const lastPickup = useRef(0);
  const field = useMemo(() => createLootField((rarity) => rarityColor[rarity] ?? '#9ca3af'), []);

  useEffect(() => {
    scene.add(field.group);
    return () => {
      scene.remove(field.group);
      field.dispose();
    };
  }, [scene, field]);

  useFrame((state) => {
    const { spawns, state: playerState, collect } = useGame.getState();
    const pickupRadius = playerState?.stats.pickupRadius ?? 2.2;
    const closest = field.update(
      spawns,
      playerPosition.x,
      playerPosition.z,
      state.clock.elapsedTime,
      pickupRadius,
    );

    // Automatisch oprapen zodra je er langs loopt: op een telefoon is dat
    // prettiger dan overal op moeten tikken.
    const now = Date.now();
    if (closest && closest.distance <= pickupRadius && now - lastPickup.current > PICKUP_COOLDOWN_MS) {
      lastPickup.current = now;
      void collect(closest.spawn);
    }
  });

  return null;
}
