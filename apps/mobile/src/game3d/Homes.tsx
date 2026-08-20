import { relevantAddresses } from '@game/shared';
import { useThree } from '@react-three/fiber/native';
import { useEffect, useMemo } from 'react';
import { createDoorways, type DoorMarker } from './city/doorway';
import { QUALITY, type QualityLevel } from './city/quality';
import { useGame } from '../state/useGame';

/**
 * Je eigen voordeur, en de panden die te koop staan.
 *
 * Alleen de woningen die er nu toe doen: waar je woont plus de eerstvolgende
 * twee. Anders hangt de halve stad vol met bordjes voor een landhuis dat je
 * pas over dertig levels kunt betalen.
 */
export function Homes({ level }: { level: QualityLevel }) {
  const { scene } = useThree();
  const shadows = QUALITY[level].shadows;
  const propertyId = useGame((s) => s.state?.player.propertyId);
  const seed = useGame((s) => s.state?.player.seed);

  const markers: DoorMarker[] = useMemo(() => {
    if (!propertyId || seed === undefined) return [];
    return relevantAddresses(propertyId, seed).map((entry) => ({
      address: entry.address,
      owned: entry.owned,
    }));
  }, [propertyId, seed]);

  const doorways = useMemo(() => createDoorways(markers, shadows), [markers, shadows]);

  useEffect(() => {
    scene.add(doorways.group);
    return () => {
      scene.remove(doorways.group);
      doorways.dispose();
    };
  }, [scene, doorways]);

  return null;
}
