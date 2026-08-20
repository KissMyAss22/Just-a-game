import type { SpawnDto } from '@game/shared';
import { groundHeightAt } from '@game/shared';
import * as THREE from 'three';
import { itemGeometry, lootScale } from './itemModels';

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

/** Zoveel exemplaren van hetzelfde item kunnen tegelijk in beeld staan. */
const PER_ITEM = 24;

export function createLootField(colorFor: (rarity: string) => string): LootField {
  const group = new THREE.Group();

  /**
   * Elk voorwerp krijgt zijn eigen model, en dus zijn eigen instanced mesh.
   * Bij een handvol soorten in beeld zijn dat een paar tekenopdrachten; één
   * gedeelde vorm voor alles zou goedkoper zijn, maar dan lag er overal
   * hetzelfde blokje op straat.
   */
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.42,
    metalness: 0.25,
  });
  const meshes = new Map<string, THREE.InstancedMesh>();
  const counters = new Map<string, number>();

  function meshFor(itemId: string): THREE.InstancedMesh {
    const existing = meshes.get(itemId);
    if (existing) return existing;
    const mesh = new THREE.InstancedMesh(itemGeometry(itemId), material, PER_ITEM);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    meshes.set(itemId, mesh);
    group.add(mesh);
    return mesh;
  }

  // De lichtvlek op de grond draagt de zeldzaamheid. Het voorwerp zelf houdt
  // zijn eigen kleuren — een gouden staaf hoort goud te zijn, ook als hij
  // episch is.
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
      counters.clear();
      for (const mesh of meshes.values()) mesh.count = 0;

      let glowCount = 0;
      let closest: { spawn: SpawnDto; distance: number } | null = null;

      for (const spawn of spawns) {
        const dx = spawn.x - playerX;
        const dz = spawn.z - playerZ;
        const squared = dx * dx + dz * dz;
        if (squared > DRAW_DISTANCE * DRAW_DISTANCE) continue;

        const distance = Math.sqrt(squared);
        if (!closest || distance < closest.distance) closest = { spawn, distance };
        if (glowCount >= MAX_VISIBLE) continue;

        const ground = groundHeightAt(spawn.x, spawn.z);
        const phase = glowCount * 0.7;
        const near = distance < pickupRadius + 1.5;

        const mesh = meshFor(spawn.itemId);
        const index = counters.get(spawn.itemId) ?? 0;
        if (index < PER_ITEM) {
          const scale = lootScale(spawn.itemId) * (near ? 1.22 : 1);
          dummy.position.set(spawn.x, ground + 0.28 + Math.sin(time * 1.8 + phase) * 0.1, spawn.z);
          dummy.rotation.set(0, time * 0.9 + phase, 0);
          dummy.scale.setScalar(scale);
          dummy.updateMatrix();
          mesh.setMatrixAt(index, dummy.matrix);
          counters.set(spawn.itemId, index + 1);
        }

        const pulse = 1.5 + Math.sin(time * 2.4 + phase) * 0.12 + (near ? 0.5 : 0);
        dummy.position.set(spawn.x, ground + 0.035, spawn.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(pulse, 1, pulse);
        dummy.updateMatrix();
        glows.setMatrixAt(glowCount, dummy.matrix);
        glows.setColorAt(glowCount, color.set(colorFor(spawn.rarity)));
        glowCount++;
      }

      for (const [itemId, mesh] of meshes) {
        mesh.count = counters.get(itemId) ?? 0;
        mesh.instanceMatrix.needsUpdate = true;
      }
      glows.count = glowCount;
      glows.instanceMatrix.needsUpdate = true;
      if (glows.instanceColor) glows.instanceColor.needsUpdate = true;

      return closest;
    },
    dispose() {
      material.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
      glowMap.dispose();
    },
  };
}
