import { ROUTE_TOLERANTIE, afstandTotRoute, type Route } from '@game/shared';
import { useFrame, useThree } from '@react-three/fiber/native';
import { useEffect, useRef } from 'react';
import {
  navigationTarget,
  playerPosition,
  routeStore,
  vernieuwRoute,
  wisRoute,
} from '../state/position';
import { buildRoute, type RouteLint } from './city/route';

/**
 * De lijn naar je bestemming, over straat.
 *
 * Dit component is de énige die de route uitrekent; de wijzer in de HUD en de
 * lijn op de kaart lezen mee uit `routeStore`. Daarvoor deden alle drie hun
 * eigen zoektocht, en de HUD zelfs vier keer per seconde.
 *
 * Er komt hier geen React-state aan te pas. Het lint wordt rechtstreeks in de
 * scene gehangen en er weer uit gehaald: een `useState` in `useFrame` trekt een
 * hertekening de frame in, en dat is precies wat je op een telefoon voelt.
 */

/** Hooguit twee keer per seconde overwegen om opnieuw te rekenen. */
const HERZIEN_NA = 0.5;

export function RouteLijn() {
  const { scene } = useThree();
  const lint = useRef<RouteLint | null>(null);
  /** De route waar het huidige lint bij hoort, om te zien of hij vernieuwd is. */
  const gebouwdVoor = useRef<Route | null>(null);
  /** Loopt er al een zoektocht? Anders plannen we er tien achter elkaar in. */
  const bezig = useRef(false);
  const sinds = useRef(0);

  function ruimOp(): void {
    if (!lint.current) return;
    scene.remove(lint.current.mesh);
    lint.current.dispose();
    lint.current = null;
  }

  useEffect(() => {
    return () => {
      ruimOp();
      gebouwdVoor.current = null;
    };
    // `ruimOp` hangt alleen aan `scene`, en die verandert niet tijdens het spelen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  useFrame((state, delta) => {
    sinds.current += delta;
    const doel = navigationTarget.current;

    if (!doel) {
      if (routeStore.current || routeStore.doel) wisRoute();
    } else {
      const route = routeStore.current;
      const nieuwDoel = doel.label !== routeStore.doel;
      const afgedwaald = route !== null && afstandTotRoute(route, playerPosition) > ROUTE_TOLERANTIE;
      const magHerzien = sinds.current > HERZIEN_NA;

      if (!bezig.current && (nieuwDoel || (magHerzien && (route === null || afgedwaald)))) {
        sinds.current = 0;
        bezig.current = true;
        // Buiten de frame. De zoeker zelf kost inmiddels een fractie van een
        // milliseconde, maar de állereerste aanroep bouwt het begaanbare raster
        // van de hele stad — en dat hoort geen frame te kosten.
        setTimeout(() => {
          try {
            vernieuwRoute(doel);
          } finally {
            bezig.current = false;
          }
        }, 0);
      }
    }

    // Het lint volgt gewoon wat er in de store staat.
    if (routeStore.current !== gebouwdVoor.current) {
      ruimOp();
      gebouwdVoor.current = routeStore.current;
      if (routeStore.current) {
        const gebouwd = buildRoute(routeStore.current);
        if (gebouwd) {
          lint.current = gebouwd;
          scene.add(gebouwd.mesh);
        }
      }
    }

    lint.current?.update(state.clock.elapsedTime);
  });

  return null;
}
