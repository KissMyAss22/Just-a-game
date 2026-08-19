/**
 * Bouwt dezelfde stad als de app, maar dan in een gewone browser.
 *
 * Waarom dit bestaat: de gevels, het wegdek en het water zijn shaders. Een
 * typefout daarin merk je niet bij het typecheken en niet in een unittest —
 * pas op de telefoon, als zwart scherm. Met deze scene draait exact dezelfde
 * code in een echte WebGL-context, zodat een fout hier al opvalt.
 */
import { buildChunk, chunksAround, streetPropsIn, treesOnLot, spawnPosition } from '@game/shared';
import * as THREE from 'three';
import { buildChunkObject } from '../../apps/mobile/src/game3d/city/chunkMesh';
import { createCharacter } from '../../apps/mobile/src/game3d/city/character';
import { createLootField } from '../../apps/mobile/src/game3d/city/loot';
import { createPropField } from '../../apps/mobile/src/game3d/city/props';
import { DAY_PALETTE, createEnvironment, createSkyDome } from '../../apps/mobile/src/game3d/city/sky';

declare global {
  interface Window {
    __preview?: { errors: string[]; info: string };
  }
}

const errors: string[] = [];
window.__preview = { errors, info: '' };

// three meldt shaderfouten via console.error; die willen we in het plaatje.
const nativeError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const text = args.map((a) => String(a)).join(' ');
  // Alleen de kern: naam, type en de eerste echte foutregel van de shader.
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  errors.push(lines.slice(0, 6).join(' // ').slice(0, 600));
  nativeError(...args);
};

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(canvas.width, canvas.height, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// three's eigen melding is summier; deze haak geeft de echte regel uit de
// GLSL-compiler, inclusief regelnummer.
renderer.debug.onShaderError = (gl, _program, _vertex, fragment) => {
  const log = gl.getShaderInfoLog(fragment) ?? '';
  errors.push(`GLSL: ${log.replace(/\u0000/g, '').split('\n').slice(0, 4).join(' | ')}`);
};

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, canvas.width / canvas.height, 0.5, 600);

const environment = createEnvironment(renderer, DAY_PALETTE);
if (environment) scene.environment = environment;

const sky = createSkyDome(DAY_PALETTE);
scene.add(sky.mesh);

const sun = new THREE.DirectionalLight(
  new THREE.Color(DAY_PALETTE.sunLight),
  DAY_PALETTE.sunIntensity,
);
sun.position.copy(DAY_PALETTE.sunDirection).multiplyScalar(120);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
sun.shadow.camera.near = 20;
sun.shadow.camera.far = 320;
sun.shadow.bias = -0.0012;
scene.add(sun);
scene.add(sun.target);

scene.add(
  new THREE.HemisphereLight(
    new THREE.Color(DAY_PALETTE.skyLight),
    new THREE.Color(DAY_PALETTE.groundLight),
    DAY_PALETTE.skyIntensity,
  ),
);

scene.fog = new THREE.Fog(new THREE.Color(DAY_PALETTE.haze), 90, 460);

const start = spawnPosition();
const player = new THREE.Vector3(start.x + 6, 0, start.z + 6);

const green: { x: number; z: number; size: number }[] = [];
const inventory: string[] = [];
const gebieden = [...chunksAround(player.x, player.z, 1), ...chunksAround(40, -60, 1)];
const gezien = new Set<string>();
for (const { chunkX, chunkZ } of gebieden.filter((c) => {
  const key = `${c.chunkX}:${c.chunkZ}`;
  if (gezien.has(key)) return false;
  gezien.add(key);
  return true;
})) {
  const content = buildChunk(chunkX, chunkZ);
  const object = buildChunkObject(content, { castShadow: true, receiveShadow: true });
  scene.add(object);
  green.push(...content.green);
  if (inventory.length === 0) {
    for (const child of object.children) {
      const mesh = child as THREE.InstancedMesh;
      const sphere = mesh.boundingSphere ?? mesh.geometry?.boundingSphere;
      inventory.push(
        `${(mesh.material as THREE.Material & { color?: THREE.Color })?.color?.getHexString() ?? '?'}` +
          `x${mesh.count ?? 1} straal=${sphere?.radius.toFixed(1) ?? 'geen'}` +
          ` y=${sphere?.center.y.toFixed(2) ?? '?'}`,
      );
    }
  }
}

const props = createPropField(true);
const rect = 150;
const all = streetPropsIn(player.x - rect, player.z - rect, player.x + rect, player.z + rect);
for (const lot of green) all.push(...treesOnLot(lot.x, lot.z, lot.size));
props.update(all, player.x, player.z);
scene.add(props.group);

// Het personage en wat loot, zodat ook die shaders hier omvallen in plaats van
// pas op de telefoon.
const character = createCharacter({ skin: '#c89066', outfit: '#2f6f5e', accent: '#e0b64a' });
character.group.position.set(player.x, 0, player.z);
character.group.rotation.y = Math.PI * 0.05;
character.update(0.016, 3.2, player.x, player.z);
scene.add(character.group);

const loot = createLootField((rarity) =>
  rarity === 'legendary' ? '#fbbf24' : rarity === 'rare' ? '#38bdf8' : '#4ade80',
);
loot.update(
  [
    { id: 'a', itemId: 'x', rarity: 'rare', x: player.x + 3.5, z: player.z + 1.5, expiresAt: 0 },
    { id: 'b', itemId: 'y', rarity: 'legendary', x: player.x - 2.5, z: player.z + 4.5, expiresAt: 0 },
    { id: 'c', itemId: 'z', rarity: 'common', x: player.x + 7.0, z: player.z - 3.0, expiresAt: 0 },
  ] as never,
  player.x,
  player.z,
  4.2,
  2.2,
);
scene.add(loot.group);

sun.target.position.set(player.x, 0, player.z);
sun.target.updateMatrixWorld();

/**
 * Drie beelden onder elkaar in hetzelfde plaatje: het spelbeeld, een overzicht
 * van bovenaf om te zien of alles op de grond staat, en een close-up van een
 * gevel. Zo is één schermafdruk genoeg om te beoordelen wat er veranderd is.
 */
const views: { name: string; height: number; place: (c: THREE.PerspectiveCamera) => void }[] = [
  {
    name: 'spelbeeld',
    height: 600,
    place: (c) => {
      c.position.set(player.x + 3.2, 2.6, player.z - 6.2);
      c.lookAt(player.x, 1.15, player.z);
    },
  },
  {
    name: 'overzicht',
    height: 400,
    place: (c) => {
      c.position.set(player.x + 60, 70, player.z + 80);
      c.lookAt(player.x, 0, player.z);
    },
  },
  {
    name: 'centrum',
    height: 300,
    place: (c) => {
      // Het Centrum heeft vliesgevels; die wil je apart kunnen bekijken.
      c.position.set(60, 26, 40);
      c.lookAt(20, 34, -70);
    },
  },
  {
    name: 'straatniveau',
    height: 300,
    place: (c) => {
      c.position.set(player.x + 2, 1.7, player.z + 3);
      c.lookAt(player.x - 20, 8, player.z - 30);
    },
  },
];

renderer.setScissorTest(true);
let offset = canvas.height;
for (const view of views) {
  offset -= view.height;
  camera.aspect = canvas.width / view.height;
  camera.updateProjectionMatrix();
  view.place(camera);
  sky.update(camera, 12);
  renderer.setViewport(0, offset, canvas.width, view.height);
  renderer.setScissor(0, offset, canvas.width, view.height);
  try {
    renderer.render(scene, camera);
  } catch (error) {
    errors.push(`${view.name}: ${String(error)}`);
  }
}

const gl = renderer.getContext();
let glError = gl.getError();
while (glError !== gl.NO_ERROR) {
  errors.push(`WebGL-fout 0x${glError.toString(16)}`);
  glError = gl.getError();
}

const overlay = document.getElementById('overlay');
if (overlay) {
  overlay.textContent = [
    `tekenopdrachten ${renderer.info.render.calls} | driehoeken ${renderer.info.render.triangles}`,
    `omgeving ${environment ? 'ja' : 'nee'} | programmas ${renderer.info.programs?.length ?? 0}`,
    `chunkonderdelen: ${inventory.join(' / ')}`,
    errors.length ? `FOUTEN: ${errors.join(' | ')}` : 'geen fouten',
  ].join('\n');
}

window.__preview.info = JSON.stringify({
  calls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
  programs: renderer.info.programs?.length ?? 0,
  environment: Boolean(environment),
});
document.title = errors.length ? `FOUT: ${errors.join(' | ')}` : 'ok';
