import { useFrame, useThree } from '@react-three/fiber/native';
import { useEffect, useMemo } from 'react';
import { createCrowd, type NamePlate } from './city/crowd';
import { NIGHT_UNIFORM } from './city/materials';

/**
 * De andere spelers. Het tekenwerk zit in city/crowd.ts; dit component hangt
 * het in de scene en geeft de camera door, zodat de naambordjes op de goede
 * plek op het scherm terechtkomen.
 */

/** De bordjes van het laatste frame. De HUD leest ze op zijn eigen tempo. */
export const namePlates: { current: NamePlate[] } = { current: [] };

export function Crowd() {
  const { scene, size } = useThree();
  const crowd = useMemo(() => createCrowd(false), []);

  useEffect(() => {
    scene.add(crowd.group);
    namePlates.current = crowd.plates;
    return () => {
      scene.remove(crowd.group);
      crowd.dispose();
      namePlates.current = [];
    };
  }, [scene, crowd]);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    crowd.update(state.camera, size.width, size.height, delta, NIGHT_UNIFORM.value);
  });

  return null;
}
