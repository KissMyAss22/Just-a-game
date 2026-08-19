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

/**
 * De lamp zelf en de lichtplas eronder, als losse geometrie op dezelfde
 * plek als de paal. Ze krijgen dezelfde matrices als de lantaarns en worden
 * met optellende menging getekend, dus overdag zijn ze op nul te zetten
 * zonder dat er iets van overblijft.
 */
function lampGlowGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(0.30, 8, 6);
  geometry.scale(1, 0.55, 1.5);
  geometry.translate(0, 5.24, 1.32);
  return geometry;
}

function lampPoolGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(9, 9);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0.03, 1.3);
  return geometry;
}

/** Zachte ronde lichtvlek; hetzelfde verloop als de contactschaduw, maar licht. */
function poolTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const radius = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const value = (1 - radius) ** 2.6;
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = 236;
      data[index + 2] = 196;
      data[index + 3] = Math.round(value * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
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
  /** 0 = dag, 1 = nacht: bepaalt of de lantaarns branden. */
  setNight: (amount: number) => void;
  dispose: () => void;
}

export function createPropField(castShadow: boolean, rangeScale = 1): PropField {
  const group = new THREE.Group();
  const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02 });
  const glossy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.24, metalness: 0.5 });
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  const glowMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffe6b4'),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const poolMap = poolTexture();
  const poolMaterial = new THREE.MeshBasicMaterial({
    map: poolMap,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const lampCapacity = SETUP.lamp.capacity;
  const lampGlow = new THREE.InstancedMesh(lampGlowGeometry(), glowMaterial, lampCapacity);
  const lampPool = new THREE.InstancedMesh(lampPoolGeometry(), poolMaterial, lampCapacity);
  for (const mesh of [lampGlow, lampPool]) {
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = 4;
    group.add(mesh);
  }

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
        if (prop.kind === 'lamp') {
          lampGlow.setMatrixAt(index, dummy.matrix);
          lampPool.setMatrixAt(index, dummy.matrix);
        }

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

      const lamps = counters.get('lamp') ?? 0;
      lampGlow.count = lamps;
      lampPool.count = lamps;
      lampGlow.instanceMatrix.needsUpdate = true;
      lampPool.instanceMatrix.needsUpdate = true;
    },
    setNight(amount) {
      // Onder een kwart nacht branden ze nog niet; dan is het licht toch niet
      // te zien en scheelt het twee tekenopdrachten.
      const glow = Math.max(0, (amount - 0.25) / 0.75);
      glowMaterial.opacity = glow;
      poolMaterial.opacity = glow * 0.95;
      lampGlow.visible = glow > 0.01;
      lampPool.visible = glow > 0.01;
    },
    dispose() {
      for (const mesh of meshes.values()) mesh.geometry.dispose();
      lampGlow.geometry.dispose();
      lampPool.geometry.dispose();
      glowMaterial.dispose();
      poolMaterial.dispose();
      poolMap.dispose();
      matte.dispose();
      glossy.dispose();
    },
  };
}
