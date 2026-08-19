/**
 * Bouwt dezelfde stad als de app, maar dan in een gewone browser.
 *
 * Waarom dit bestaat: de gevels, het wegdek en het water zijn shaders. Een
 * typefout daarin merk je niet bij het typechecken en niet in een unittest —
 * pas op de telefoon, als zwart scherm. Met deze scene draait exact dezelfde
 * code in een echte WebGL-context, zodat een fout hier al opvalt.
 *
 * De vier beelden staan op verschillende uren, zodat ook de dag- en
 * nachtcyclus te beoordelen is zonder tot vanavond te wachten.
 */
import { spawnPosition } from '@game/shared';
import * as THREE from 'three';
import { createCharacter } from '../../apps/mobile/src/game3d/city/character';
import { createLootField } from '../../apps/mobile/src/game3d/city/loot';
import { QUALITY } from '../../apps/mobile/src/game3d/city/quality';
import { createWorld } from '../../apps/mobile/src/game3d/city/world';

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
// De melding van three is summier; deze haak geeft de echte regel uit de
// GLSL-compiler, inclusief regelnummer.
renderer.debug.onShaderError = (gl, _program, _vertex, fragment) => {
  const log = (gl.getShaderInfoLog(fragment) ?? '').replace(/[^\x20-\x7e\n]/g, '');
  errors.push(`GLSL: ${log.split('\n').slice(0, 4).join(' | ')}`);
};

const scene = new THREE.Scene();
const settings = QUALITY.hoog;
const camera = new THREE.PerspectiveCamera(52, 1, 0.4, settings.far);

const start = spawnPosition();
const player = { x: start.x + 6, z: start.z + 6 };

// Precies de wereld die de app ook opbouwt, met een klok die wij bepalen.
let hour = 13;
const world = createWorld(renderer, scene, 'hoog', () => hour);
scene.add(world.root);

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

interface View {
  name: string;
  hour: number;
  height: number;
  place: (c: THREE.PerspectiveCamera) => void;
}

const views: View[] = [
  {
    name: 'ochtend',
    hour: 8.5,
    height: 460,
    place: (c) => {
      c.position.set(player.x + 3.2, 2.6, player.z - 6.2);
      c.lookAt(player.x, 1.15, player.z);
    },
  },
  {
    name: 'middag',
    hour: 13,
    height: 380,
    place: (c) => {
      c.position.set(player.x + 60, 70, player.z + 80);
      c.lookAt(player.x, 0, player.z);
    },
  },
  {
    name: 'schemer',
    hour: 20.4,
    height: 330,
    place: (c) => {
      c.position.set(60, 26, 40);
      c.lookAt(20, 34, -70);
    },
  },
  {
    name: 'nacht',
    hour: 23,
    height: 330,
    place: (c) => {
      c.position.set(player.x + 9, 4.5, player.z + 12);
      c.lookAt(player.x, 1.6, player.z);
    },
  },
];

renderer.setScissorTest(true);
let offset = canvas.height;
for (const view of views) {
  offset -= view.height;
  hour = view.hour;
  camera.aspect = canvas.width / view.height;
  camera.updateProjectionMatrix();
  view.place(camera);
  world.update(camera, 12, player.x, player.z);
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
    `tekenopdrachten ${renderer.info.render.calls} | driehoeken ${renderer.info.render.triangles}` +
      ` | programmas ${renderer.info.programs?.length ?? 0}`,
    `uren van boven naar beneden: ${views.map((v) => `${v.name} ${v.hour}`).join(' / ')}`,
    errors.length ? `FOUTEN: ${errors.join(' | ')}` : 'geen fouten',
  ].join('\n');
}

window.__preview.info = JSON.stringify({ calls: renderer.info.render.calls, errors: errors.length });
document.title = errors.length ? `FOUT: ${errors[0]}` : 'ok';
