import { buildChunk, type ChunkContent } from '@game/shared';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * Chunks worden één keer berekend en daarna bewaard. Terugkomen in een wijk
 * kost dan niets meer.
 */
const chunkCache = new Map<string, ChunkContent>();

export function getChunk(chunkX: number, chunkZ: number): ChunkContent {
  const key = `${chunkX}:${chunkZ}`;
  const cached = chunkCache.get(key);
  if (cached) return cached;
  const built = buildChunk(chunkX, chunkZ);
  chunkCache.set(key, built);
  return built;
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const dummy = new THREE.Object3D();
const scratchColor = new THREE.Color();

/** Gebouwen als één instanced mesh: honderden panden, één draw call. */
function Buildings({ content }: { content: ChunkContent }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    content.buildings.forEach((building, index) => {
      dummy.position.set(building.centerX, building.height / 2, building.centerZ);
      dummy.scale.set(building.width, building.height, building.depth);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, scratchColor.set(building.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [content]);

  if (content.buildings.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[UNIT_BOX, undefined, content.buildings.length]}
      frustumCulled
    >
      <meshLambertMaterial vertexColors />
    </instancedMesh>
  );
}

/** Plantsoenen en binnenplaatsen: platte groene vlakken tussen de panden. */
function Parks({ content }: { content: ChunkContent }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    content.parks.forEach((park, index) => {
      dummy.position.set(park.x, 0.06, park.z);
      dummy.scale.set(park.size * 0.94, 0.12, park.size * 0.94);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [content]);

  if (content.parks.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[UNIT_BOX, undefined, content.parks.length]}>
      <meshLambertMaterial color="#3f6b45" />
    </instancedMesh>
  );
}

function Water({ content }: { content: ChunkContent }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    content.water.forEach((cell, index) => {
      dummy.position.set(cell.x, -0.4, cell.z);
      dummy.scale.set(cell.size, 0.8, cell.size);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [content]);

  if (content.water.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[UNIT_BOX, undefined, content.water.length]}>
      <meshLambertMaterial color="#17384f" />
    </instancedMesh>
  );
}

export function ChunkView({ chunkX, chunkZ }: { chunkX: number; chunkZ: number }) {
  const content = useMemo(() => getChunk(chunkX, chunkZ), [chunkX, chunkZ]);

  return (
    <group>
      {/* Wegdek en trottoir: één vlak per chunk in de kleur van het district. */}
      <mesh
        position={[content.centerX, 0, content.centerZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow={false}
      >
        <planeGeometry args={[content.size, content.size]} />
        <meshLambertMaterial color={content.groundColor} />
      </mesh>
      <Water content={content} />
      <Parks content={content} />
      <Buildings content={content} />
    </group>
  );
}
