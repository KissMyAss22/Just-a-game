import type { SpawnDto } from '@game/shared';
import { groundHeightAt } from '@game/shared';
import * as THREE from 'three';

/**
 * Items op straat.
 *
 * Twee instanced meshes: het voorwerp zelf en een lichtvlek op de grond. Die
 * vlek doet het meeste werk — hij verankert het item op het wegdek en is van
 * ver al te zien, ook als het voorwerp zelf achter een auto ligt.
 */

const MAX_VISIBLE = 90;
const DRAW_DISTANCE = 140;

function glowTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const radius = Math.sqrt(dx * dx + dy * dy) * 2;
      // Een ring in plaats van een vlek: dat leest als een markering en niet
      // als een lamp die in het wegdek is verzonken.
      const ring = Math.exp(-((radius - 0.62) ** 2) / 0.02);
      const core = Math.max(0, 1 - radius) ** 3 * 0.5;
      const value = Math.min(1, ring * 0.9 + core);
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(value * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

export interface LootField {
  group: THREE.Group;
  /** Tekent alles in de buurt en geeft terug wat het dichtstbij ligt. */
  update: (
    spawns: readonly SpawnDto[],
    playerX: number,
    playerZ: number,
    time: number,
    pickupRadius: number,
  ) => { spawn: SpawnDto; distance: number } | null;
  dispose: () => void;
}

export function createLootField(colorFor: (rarity: string) => string): LootField {
  const group = new THREE.Group();

  const gemGeometry = new THREE.OctahedronGeometry(0.42, 0);
  const gemMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.16,
    metalness: 0.35,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.28,
  });
  // De emissie moet de kleur van het item volgen, en die zit per instance in
  // vColor. Zonder deze regel gloeit alles even wit op.
  gemMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
totalEmissiveRadiance *= diffuseColor.rgb * 3.0;`,
    );
  };
  // Zonder kleurattribuut past three de instance-kleur niet toe.
  gemGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(
      new Float32Array(gemGeometry.attributes.position!.count * 3).fill(1),
      3,
    ),
  );

  const gems = new THREE.InstancedMesh(gemGeometry, gemMaterial, MAX_VISIBLE);
  gems.count = 0;
  gems.frustumCulled = false;
  group.add(gems);

  const glowMap = glowTexture();
  const glowGeometry = new THREE.PlaneGeometry(1, 1);
  glowGeometry.rotateX(-Math.PI / 2);
  glowGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(
      new Float32Array(glowGeometry.attributes.position!.count * 3).fill(1),
      3,
    ),
  );
  const glowMaterial = new THREE.MeshBasicMaterial({
    map: glowMap,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glows = new THREE.InstancedMesh(glowGeometry, glowMaterial, MAX_VISIBLE);
  glows.count = 0;
  glows.frustumCulled = false;
  glows.renderOrder = 3;
  group.add(glows);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  return {
    group,
    update(spawns, playerX, playerZ, time, pickupRadius) {
      let index = 0;
      let closest: { spawn: SpawnDto; distance: number } | null = null;

      for (const spawn of spawns) {
        const dx = spawn.x - playerX;
        const dz = spawn.z - playerZ;
        const squared = dx * dx + dz * dz;
        if (squared > DRAW_DISTANCE * DRAW_DISTANCE) continue;

        const distance = Math.sqrt(squared);
        if (!closest || distance < closest.distance) closest = { spawn, distance };
        if (index >= MAX_VISIBLE) continue;

        const ground = groundHeightAt(spawn.x, spawn.z);
        const phase = index * 0.7;
        const near = distance < pickupRadius + 1.5;

        dummy.position.set(spawn.x, ground + 0.75 + Math.sin(time * 1.8 + phase) * 0.14, spawn.z);
        dummy.rotation.set(0.42, time * 1.0 + phase, 0.2);
        dummy.scale.setScalar(near ? 1.3 : 1);
        dummy.updateMatrix();
        gems.setMatrixAt(index, dummy.matrix);

        const pulse = 1.5 + Math.sin(time * 2.4 + phase) * 0.12 + (near ? 0.5 : 0);
        dummy.position.set(spawn.x, ground + 0.035, spawn.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(pulse, 1, pulse);
        dummy.updateMatrix();
        glows.setMatrixAt(index, dummy.matrix);

        color.set(colorFor(spawn.rarity));
        gems.setColorAt(index, color);
        glows.setColorAt(index, color);
        index++;
      }

      gems.count = index;
      glows.count = index;
      gems.instanceMatrix.needsUpdate = true;
      glows.instanceMatrix.needsUpdate = true;
      if (gems.instanceColor) gems.instanceColor.needsUpdate = true;
      if (glows.instanceColor) glows.instanceColor.needsUpdate = true;

      return closest;
    },
    dispose() {
      gemGeometry.dispose();
      gemMaterial.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
      glowMap.dispose();
    },
  };
}
