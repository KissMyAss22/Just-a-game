import { ROUTE_TOLERANTIE, afstandTotRoute, findRoute, type Route } from '@game/shared';
import { useFrame, useThree } from '@react-three/fiber/native';
import { useEffect, useRef, useState } from 'react';
import { navigationTarget, playerPosition } from '../state/position';
import { buildRoute, type RouteLint } from './city/route';

/**
 * De lijn naar je bestemming, over straat.
 *
 * Hij wordt niet elke frame opnieuw gezocht: A* over het celraster kost een paar
 * tientallen milliseconden, en dat is snel voor een knop maar veel te traag voor
 * zestig keer per seconde. Opnieuw rekenen gebeurt als je een andere bestemming
 * kiest, of als je meer dan `ROUTE_TOLERANTIE` van de lijn af raakt — dan ben je
 * kennelijk een andere kant op gelopen.
 */
export function RouteLijn() {
  const { scene } = useThree();
  const [route, setRoute] = useState<Route | null>(null);
  const lint = useRef<RouteLint | null>(null);
  const doelLabel = useRef<string | null>(null);
  const sinds = useRef(0);

  // De bestemming leeft buiten React; de route hangt eraan.
  useFrame((_state, delta) => {
    sinds.current += delta;
    const doel = navigationTarget.current;

    if (!doel) {
      if (route) {
        setRoute(null);
        doelLabel.current = null;
      }
      return;
    }

    const nieuwDoel = doel.label !== doelLabel.current;
    // Hooguit twee keer per seconde overwegen om opnieuw te rekenen; vaker
    // levert niets op en kost wel.
    const magHerzien = sinds.current > 0.5;
    const afgedwaald =
      route !== null && afstandTotRoute(route, playerPosition) > ROUTE_TOLERANTIE;

    if (nieuwDoel || (magHerzien && (route === null || afgedwaald))) {
      sinds.current = 0;
      doelLabel.current = doel.label;
      setRoute(findRoute({ x: playerPosition.x, z: playerPosition.z }, { x: doel.x, z: doel.z }));
    }

    lint.current?.update(_state.clock.elapsedTime);
  });

  useEffect(() => {
    if (!route) return;
    const gebouwd = buildRoute(route);
    if (!gebouwd) return;
    lint.current = gebouwd;
    scene.add(gebouwd.mesh);
    return () => {
      scene.remove(gebouwd.mesh);
      gebouwd.dispose();
      if (lint.current === gebouwd) lint.current = null;
    };
  }, [route, scene]);

  return null;
}
