import { SIDEWALK_HEIGHT, type StreetProp, type PropKind } from '@game/shared';
import * as THREE from 'three';
import { mergeParts, standingBox, standingCylinder, type Part } from './geometry';

/**
 * Straatmeubilair: lantaarns, bomen, banken, prullenbakken, brandkranen en
 * geparkeerde auto's.
 *
 * Dit is wat een raster van blokken in een stráát verandert. Alles staat per
 * soort in één instanced mesh, dus honderd lantaarnpalen kosten één
 * tekenopdracht. De onderdelen zijn tot één geometrie samengesmolten met hun
 * kleur in de punten gebakken; de instance-kleur werkt daar als tint overheen.
 */

function lampGeometry(): THREE.BufferGeometry {
  const dark = '#2b3036';
  const parts: Part[] = [
    { geometry: standingCylinder(0.17, 0.21, 0.28, 8), color: '#22262b' },
    { geometry: standingCylinder(0.06, 0.09, 5.2, 8), color: dark, position: [0, 0.28, 0] },
    { geometry: standingBox(0.09, 0.09, 1.45), color: dark, position: [0, 5.42, 0.72] },
    { geometry: standingBox(0.30, 0.14, 0.66), color: '#3b4249', position: [0, 5.30, 1.32] },
    { geometry: standingBox(0.24, 0.05, 0.56), color: '#f6ecd2', position: [0, 5.26, 1.32] },
  ];
  return mergeParts(parts);
}

function treeGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    { geometry: standingCylinder(0.14, 0.24, 2.3, 7), color: '#54402c' },
    {
      geometry: new THREE.IcosahedronGeometry(1.5, 1),
      color: '#375c2f',
      position: [0, 3.3, 0],
      scale: [1, 0.86, 1],
    },
    {
      geometry: new THREE.IcosahedronGeometry(1.05, 1),
      color: '#436b36',
      position: [0.55, 4.1, -0.35],
    },
    {
      geometry: new THREE.IcosahedronGeometry(0.9, 1),
      color: '#2e4d28',
      position: [-0.6, 3.9, 0.45],
    },
  ];
  return mergeParts(parts);
}

function benchGeometry(): THREE.BufferGeometry {
  const wood = '#8a6239';
  const iron = '#31363c';
  const parts: Part[] = [
    { geometry: standingBox(0.09, 0.42, 0.48), color: iron, position: [-0.72, 0, 0] },
    { geometry: standingBox(0.09, 0.42, 0.48), color: iron, position: [0.72, 0, 0] },
    { geometry: standingBox(1.75, 0.08, 0.52), color: wood, position: [0, 0.42, 0] },
    { geometry: standingBox(1.75, 0.46, 0.07), color: wood, position: [0, 0.50, -0.24] },
  ];
  return mergeParts(parts);
}

function binGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    { geometry: standingCylinder(0.27, 0.22, 0.82, 10), color: '#2c3a33' },
    { geometry: standingCylinder(0.30, 0.30, 0.07, 10), color: '#1d2723', position: [0, 0.82, 0] },
  ];
  return mergeParts(parts);
}

function hydrantGeometry(): THREE.BufferGeometry {
  const red = '#a83127';
  const parts: Part[] = [
    { geometry: standingCylinder(0.15, 0.19, 0.55, 8), color: red },
    { geometry: standingBox(0.44, 0.11, 0.11), color: red, position: [0, 0.34, 0] },
    { geometry: new THREE.SphereGeometry(0.15, 8, 6), color: '#c4463a', position: [0, 0.58, 0] },
  ];
  return mergeParts(parts);
}

/**
 * Een auto met de neus langs de x-as. Het koetswerk is wit gebakken zodat de
 * instance-kleur de lak bepaalt; ruiten, banden en lampen blijven wat ze zijn.
 */
function carGeometry(): THREE.BufferGeometry {
  const body = '#ffffff';
  const glass = '#0d141d';
  const rubber = '#15171a';
  const parts: Part[] = [
    { geometry: standingBox(4.20, 0.52, 1.76), color: body, position: [0, 0.42, 0] },
    { geometry: standingBox(3.40, 0.26, 1.80), color: body, position: [0, 0.90, 0] },
    { geometry: standingBox(2.05, 0.52, 1.58), color: body, position: [-0.15, 1.10, 0] },
    { geometry: standingBox(1.92, 0.40, 1.63), color: glass, position: [-0.15, 1.16, 0] },
    { geometry: standingBox(0.30, 0.14, 1.50), color: glass, position: [1.60, 1.02, 0] },
    { geometry: standingBox(0.16, 0.16, 0.34), color: '#f4f1dc', position: [2.02, 0.60, 0.60] },
    { geometry: standingBox(0.16, 0.16, 0.34), color: '#f4f1dc', position: [2.02, 0.60, -0.60] },
    { geometry: standingBox(0.14, 0.18, 0.40), color: '#8e2420', position: [-2.06, 0.62, 0.55] },
    { geometry: standingBox(0.14, 0.18, 0.40), color: '#8e2420', position: [-2.06, 0.62, -0.55] },
    ...([
      [1.32, 0.90],
      [1.32, -0.90],
      [-1.32, 0.90],
      [-1.32, -0.90],
    ] as const).map(([x, z]): Part => ({
      geometry: new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12),
      color: rubber,
      position: [x, 0.34, z],
      rotation: [Math.PI / 2, 0, 0],
    })),
  ];
  return mergeParts(parts);
}

const CAR_COLORS = [
  '#c8ccd2',
  '#2b3038',
  '#8e1f23',
  '#1f3f6b',
  '#e6e8ea',
  '#4a4f55',
  '#1d5c4a',
  '#b8912f',
];

interface KindSetup {
  geometry: () => THREE.BufferGeometry;
  capacity: number;
  /** Instance-kleur varieren? Alleen zinvol als de geometrie wit is gebakken. */
  tinted: boolean;
  glossy: boolean;
  /** Binnen welke afstand van de speler dit meubilair nog getekend wordt. */
  range: number;
}

const SETUP: Record<PropKind, KindSetup> = {
  lamp: { geometry: lampGeometry, capacity: 220, tinted: false, glossy: false, range: 150 },
  tree: { geometry: treeGeometry, capacity: 180, tinted: false, glossy: false, range: 130 },
  bench: { geometry: benchGeometry, capacity: 60, tinted: false, glossy: false, range: 110 },
  bin: { geometry: binGeometry, capacity: 80, tinted: false, glossy: false, range: 110 },
  hydrant: { geometry: hydrantGeometry, capacity: 60, tinted: false, glossy: false, range: 110 },
  car: { geometry: carGeometry, capacity: 110, tinted: true, glossy: true, range: 140 },
};

export interface PropField {
  group: THREE.Group;
  /** Vult de instanced meshes met alles binnen bereik van de speler. */
  update: (props: StreetProp[], playerX: number, playerZ: number) => void;
  dispose: () => void;
}

export function createPropField(castShadow: boolean, rangeScale = 1): PropField {
  const group = new THREE.Group();
  const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02 });
  const glossy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.24, metalness: 0.5 });
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  const meshes = new Map<PropKind, THREE.InstancedMesh>();
  for (const [kind, setup] of Object.entries(SETUP) as [PropKind, KindSetup][]) {
    const mesh = new THREE.InstancedMesh(
      setup.geometry(),
      setup.glossy ? glossy : matte,
      setup.capacity,
    );
    mesh.count = 0;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    meshes.set(kind, mesh);
    group.add(mesh);
  }

  const counters = new Map<PropKind, number>();

  return {
    group,
    update(props, playerX, playerZ) {
      counters.clear();
      for (const mesh of meshes.values()) mesh.count = 0;

      for (const prop of props) {
        const setup = SETUP[prop.kind];
        const mesh = meshes.get(prop.kind);
        if (!mesh) continue;
        const index = counters.get(prop.kind) ?? 0;
        if (index >= setup.capacity) continue;

        const dx = prop.x - playerX;
        const dz = prop.z - playerZ;
        const range = setup.range * rangeScale;
        if (dx * dx + dz * dz > range * range) continue;

        // Alles staat op de stoep; alleen auto's staan op het rijdek.
        const y = prop.kind === 'car' ? 0 : SIDEWALK_HEIGHT;
        dummy.position.set(prop.x, y, prop.z);
        dummy.rotation.set(0, prop.rotY, 0);
        dummy.scale.setScalar(prop.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);

        if (setup.tinted) {
          const paint = CAR_COLORS[Math.floor(prop.variant * CAR_COLORS.length) % CAR_COLORS.length]!;
          mesh.setColorAt(index, color.set(paint));
        }
        counters.set(prop.kind, index + 1);
      }

      for (const [kind, mesh] of meshes) {
        mesh.count = counters.get(kind) ?? 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    },
    dispose() {
      for (const mesh of meshes.values()) mesh.geometry.dispose();
      matte.dispose();
      glossy.dispose();
    },
  };
}
