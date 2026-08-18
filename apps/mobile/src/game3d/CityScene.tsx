import { chunkAtWorld, chunksAround } from '@game/shared';
import { Canvas, useFrame } from '@react-three/fiber/native';
import { useRef, useState } from 'react';
import * as THREE from 'three';
import { playerPosition } from '../state/position';
import { ChunkView } from './Chunk';
import { PlayerRig } from './PlayerRig';
import { SpawnField } from './SpawnField';

/** Hoeveel chunks rondom de speler in beeld staan (1 = 3x3 = 384 m). */
const VIEW_RANGE = 1;

/**
 * Laadt alleen de omgeving van de speler in de scene. Zodra hij een chunk
 * verder is, wisselt de set — de rest van de stad bestaat wel als data, maar
 * kost niets aan geheugen of rekenkracht.
 */
function CityChunks() {
  const [visible, setVisible] = useState(() =>
    chunksAround(playerPosition.x, playerPosition.z, VIEW_RANGE),
  );
  const current = useRef(chunkAtWorld(playerPosition.x, playerPosition.z));

  useFrame(() => {
    const chunk = chunkAtWorld(playerPosition.x, playerPosition.z);
    if (chunk.chunkX === current.current.chunkX && chunk.chunkZ === current.current.chunkZ) {
      return;
    }
    current.current = chunk;
    setVisible(chunksAround(playerPosition.x, playerPosition.z, VIEW_RANGE));
  });

  return (
    <>
      {visible.map((chunk) => (
        <ChunkView
          key={`${chunk.chunkX}:${chunk.chunkZ}`}
          chunkX={chunk.chunkX}
          chunkZ={chunk.chunkZ}
        />
      ))}
    </>
  );
}

export function CityScene() {
  return (
    <Canvas
      gl={{ antialias: false }}
      camera={{ fov: 55, near: 0.5, far: 340, position: [0, 9, 15] }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor('#0b1020');
        // Mist verbergt de rand van de geladen chunks; je ziet geen abrupte
        // grens, alleen een stad die in de verte oplost.
        scene.fog = new THREE.Fog('#0b1020', 80, 300);
      }}
    >
      <ambientLight intensity={1.3} />
      <hemisphereLight args={['#8fb3ff', '#141a2a', 0.55]} />
      <directionalLight position={[60, 90, 30]} intensity={1.4} />
      <CityChunks />
      <SpawnField />
      <PlayerRig />
    </Canvas>
  );
}
