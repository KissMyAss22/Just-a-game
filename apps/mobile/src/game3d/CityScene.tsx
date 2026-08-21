import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { QUALITY, type QualityLevel } from './city/quality';
import { createWorld } from './city/world';
import { playerPosition, routeStore } from '../state/position';
import { renderStats, worldClock } from '../state/devWorld';
import { currentHour } from './city/sky';
import { useSettings } from '../state/useSettings';
import { Crowd } from './Crowd';
import { PlayerRig } from './PlayerRig';
import { Homes } from './Homes';
import { Shops } from './Shops';
import { SpawnField } from './SpawnField';
import { RouteLijn } from './Route';

/**
 * De buitenwereld. De scene zelf wordt buiten React opgebouwd (zie
 * city/world.ts); dit component hangt hem alleen in de canvas en geeft elke
 * frame de spelerpositie door.
 */
function World({ level }: { level: QualityLevel }) {
  const { gl, scene, camera } = useThree();
  // De klok wordt elke frame opnieuw gelezen, dus een vast uur uit het
  // testgereedschap slaat meteen aan zonder de wereld opnieuw op te bouwen.
  const world = useMemo(
    () => createWorld(gl, scene, level, () => worldClock.hour ?? currentHour()),
    [gl, scene, level],
  );

  // Wat dit toestel aankan. Eén keer bij het opbouwen: het verandert niet, en
  // het verklaart waarom twee telefoons hetzelfde beeld anders laten zien.
  useEffect(() => {
    renderStats.omgeving = world.heeftOmgeving;
    renderStats.anisotropie = gl.capabilities.getMaxAnisotropy();
    renderStats.webgl2 = gl.capabilities.isWebGL2 !== false;
  }, [gl, world]);

  useEffect(() => {
    scene.add(world.root);
    // Meteen één keer bijwerken, anders staat de speler een frame in het niets.
    world.update(camera, 0, playerPosition.x, playerPosition.z);
    return () => {
      scene.remove(world.root);
      world.dispose();
    };
  }, [scene, camera, world]);

  /** Loopvenster van één seconde voor de slechtste frame en de routetellers. */
  const meetvenster = useRef({ worst: 0, tijd: 0, routes: 0 });

  useFrame((state, delta) => {
    world.update(state.camera, state.clock.elapsedTime, playerPosition.x, playerPosition.z);

    // Meetwaarden voor de debug-overlay. Dit kost niets zolang niemand kijkt:
    // het zijn getallen uit tellers die three en de routestore toch al bijhouden.
    const info = state.gl.info;
    renderStats.calls = info.render.calls;
    renderStats.triangles = info.render.triangles;
    renderStats.programs = info.programs?.length ?? 0;
    renderStats.routeMs = routeStore.kosten;
    if (delta > 0) {
      // Voortschrijdend gemiddelde: een losse frame zegt niets, en een teller
      // die staat te knipperen is niet af te lezen.
      renderStats.fps = renderStats.fps * 0.9 + (1 / delta) * 0.1;
    }

    // En naast dat gemiddelde de slechtste frame van de afgelopen seconde.
    // Precies wat het gemiddelde wegpoetst: één stilstand van een halve seconde
    // trekt de fps-teller nauwelijks omlaag, maar je voelt hem wel.
    const venster = meetvenster.current;
    venster.worst = Math.max(venster.worst, delta * 1000);
    venster.tijd += delta;
    if (venster.tijd >= 1) {
      renderStats.worstFrameMs = venster.worst;
      renderStats.routesPerSec = routeStore.aantal - venster.routes;
      venster.routes = routeStore.aantal;
      venster.worst = 0;
      venster.tijd = 0;
    }
  });

  return null;
}

export function CityScene() {
  const level = useSettings((s) => s.quality);
  const settings = QUALITY[level];

  return (
    <Canvas
      key={level}
      gl={{ antialias: settings.antialias, powerPreference: 'high-performance' }}
      // PCFSoftShadowMap bestaat niet meer op elk toestel; three valt dan met
      // een waarschuwing per shader terug op PCFShadowMap. Dan vragen we die
      // meteen zelf, in plaats van de logs vol te laten lopen.
      shadows={settings.shadows ? { type: THREE.PCFShadowMap } : false}
      camera={{ fov: 52, near: 0.4, far: settings.far, position: [0, 9, 15] }}
      onCreated={({ gl }) => {
        // ACES haalt de felle plekken terug zonder de rest grauw te maken; dat
        // is het verschil tussen "gerenderd" en "gefotografeerd".
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.setClearColor('#9fb6cc');
      }}
    >
      <World level={level} />
      <SpawnField />
      <Crowd />
      <RouteLijn />
      <Shops level={level} />
      <Homes level={level} />
      <PlayerRig />
    </Canvas>
  );
}
