import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { QUALITY, type QualityLevel } from './city/quality';
import { createWorld } from './city/world';
import { playerPosition } from '../state/position';
import { useSettings } from '../state/useSettings';
import { Crowd } from './Crowd';
import { PlayerRig } from './PlayerRig';
import { SpawnField } from './SpawnField';

/**
 * De buitenwereld. De scene zelf wordt buiten React opgebouwd (zie
 * city/world.ts); dit component hangt hem alleen in de canvas en geeft elke
 * frame de spelerpositie door.
 */
function World({ level }: { level: QualityLevel }) {
  const { gl, scene, camera } = useThree();
  const world = useMemo(() => createWorld(gl, scene, level), [gl, scene, level]);

  useEffect(() => {
    scene.add(world.root);
    // Meteen één keer bijwerken, anders staat de speler een frame in het niets.
    world.update(camera, 0, playerPosition.x, playerPosition.z);
    return () => {
      scene.remove(world.root);
      world.dispose();
    };
  }, [scene, camera, world]);

  useFrame((state) => {
    world.update(state.camera, state.clock.elapsedTime, playerPosition.x, playerPosition.z);
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
      shadows={settings.shadows ? { type: THREE.PCFSoftShadowMap } : false}
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
      <PlayerRig />
    </Canvas>
  );
}
