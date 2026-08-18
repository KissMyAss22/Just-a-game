import type { SpawnDto } from '@game/shared';
import { useFrame } from '@react-three/fiber/native';
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { rarityColor } from '../ui/theme';
import { playerPosition } from '../state/position';
import { useGame } from '../state/useGame';

/** Hoeveel items er tegelijk in beeld kunnen staan. */
const MAX_VISIBLE = 80;
/** Alleen items binnen deze afstand tekenen. */
const DRAW_DISTANCE = 130;
/** Minimale tijd tussen twee oppak-verzoeken, zodat we de server niet spammen. */
const PICKUP_COOLDOWN_MS = 420;

const GEOMETRY = new THREE.OctahedronGeometry(0.55, 0);
const dummy = new THREE.Object3D();
const scratchColor = new THREE.Color();

/**
 * Alle items op straat in één instanced mesh. Elke frame kiezen we de
 * dichtstbijzijnde spawns, animeren ze, en kijken meteen of de speler er een
 * kan oppakken — dat scheelt een tweede loop over dezelfde lijst.
 */
export function SpawnField() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const lastPickup = useRef(0);
  const sorted = useRef<SpawnDto[]>([]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (mesh) mesh.count = 0;
  }, []);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const { spawns, state: playerState, collect } = useGame.getState();
    const pickupRadius = playerState?.stats.pickupRadius ?? 2.2;
    const time = state.clock.elapsedTime;

    const nearby = sorted.current;
    nearby.length = 0;
    for (const spawn of spawns) {
      const dx = spawn.x - playerPosition.x;
      const dz = spawn.z - playerPosition.z;
      if (dx * dx + dz * dz > DRAW_DISTANCE * DRAW_DISTANCE) continue;
      nearby.push(spawn);
      if (nearby.length >= MAX_VISIBLE) break;
    }

    let closest: SpawnDto | null = null;
    let closestDistance = Infinity;

    for (let index = 0; index < nearby.length; index++) {
      const spawn = nearby[index]!;
      const dx = spawn.x - playerPosition.x;
      const dz = spawn.z - playerPosition.z;
      const distance = Math.hypot(dx, dz);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = spawn;
      }

      // Elk item dobbert en draait, met een eigen fase zodat het geen
      // marcherend leger wordt.
      const phase = index * 0.7;
      dummy.position.set(spawn.x, 1.1 + Math.sin(time * 1.8 + phase) * 0.18, spawn.z);
      dummy.rotation.set(0, time * 1.1 + phase, 0.35);
      const pulse = distance < pickupRadius + 1.5 ? 1.35 : 1;
      dummy.scale.setScalar(pulse);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, scratchColor.set(rarityColor[spawn.rarity] ?? '#9ca3af'));
    }

    mesh.count = nearby.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Automatisch oprapen zodra je er langs loopt: op een telefoon is dat
    // prettiger dan overal op moeten tikken.
    const now = Date.now();
    if (closest && closestDistance <= pickupRadius && now - lastPickup.current > PICKUP_COOLDOWN_MS) {
      lastPickup.current = now;
      void collect(closest);
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[GEOMETRY, undefined, MAX_VISIBLE]} frustumCulled={false}>
      <meshLambertMaterial vertexColors emissive="#1a2b40" emissiveIntensity={0.4} />
    </instancedMesh>
  );
}
