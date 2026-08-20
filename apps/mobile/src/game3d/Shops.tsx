import { useFrame, useThree } from '@react-three/fiber/native';
import { useEffect, useMemo } from 'react';
import { createShopfronts } from './city/shopfront';
import { QUALITY, type QualityLevel } from './city/quality';

/**
 * De pandjeshuizen. Opgebouwd zoals Crowd.tsx: het tekenwerk staat buiten
 * React, dit component hangt het in de scene en tikt het per frame aan.
 */
export function Shops({ level }: { level: QualityLevel }) {
  const { scene } = useThree();
  const shadows = QUALITY[level].shadows;
  const shops = useMemo(() => createShopfronts(shadows), [shadows]);

  useEffect(() => {
    scene.add(shops.group);
    return () => {
      scene.remove(shops.group);
      shops.dispose();
    };
  }, [scene, shops]);

  useFrame((_state, rawDelta) => {
    shops.update(Math.min(rawDelta, 0.05));
  });

  return null;
}
