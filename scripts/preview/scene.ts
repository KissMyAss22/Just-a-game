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
import { getVehicle, spawnPosition } from '@game/shared';
import * as THREE from 'three';
import { createCharacter } from '../../apps/mobile/src/game3d/city/character';
import { createCrowd } from '../../apps/mobile/src/game3d/city/crowd';
import { ingestSnapshot } from '../../apps/mobile/src/net/presence';
import { createLootField } from '../../apps/mobile/src/game3d/city/loot';
import { QUALITY } from '../../apps/mobile/src/game3d/city/quality';
import { createVehicle } from '../../apps/mobile/src/game3d/city/vehicle';
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

// De renderproef stond alleen in de Oude Stad. Andere wijken hebben een ander
// palet en een andere gevelsoort, en die waren dus nooit bekeken.
const extraSpots: [number, number][] = [[-348, 124]];

const character = createCharacter({ skin: '#c89066', outfit: '#2f6f5e', accent: '#e0b64a' });
character.group.position.set(player.x, 0, player.z);
character.group.rotation.y = Math.PI * 0.05;
character.update(0.016, 3.2, player.x, player.z);
scene.add(character.group);

// Twee voertuigen op de rijbaan: de auto en de scooter delen dezelfde opbouw
// maar zien er heel anders uit, dus allebei even bekijken.
const sedan = createVehicle(getVehicle('sedan'), '#8e1f23');
sedan.place(4, 16, 0);
sedan.update(0.016, 12, 0.35, true, 0);
scene.add(sedan.group);

const scooter = createVehicle(getVehicle('scooter'), '#2f6f5e');
scooter.place(4, 5, 0.2);
scooter.update(0.016, 4, -0.2, false, 0);
scene.add(scooter.group);

// Twee nepspelers in de gedeelde wereld, zodat ook die code hier draait: één
// die loopt en één die rijdt. De renderproef praat niet met de server; hij zet
// de momentopname er rechtstreeks in.
const crowd = createCrowd(true);
scene.add(crowd.group);
ingestSnapshot({
  t: 'snapshot',
  at: Date.now(),
  players: [
    { id: 'p1', n: 'Sanne', x: player.x - 4.5, z: player.z + 6, h: 2.6, d: 0, v: 'on_foot', level: 12, s: 2, o: 3, a: 1 },
    { id: 'p2', n: 'Joost', x: 4, z: player.z + 26, h: 0, d: 1, v: 'hatchback', level: 27, s: 0, o: 1, a: 4 },
  ],
});

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
    name: 'gevel van dichtbij',
    hour: 11,
    height: 460,
    place: (c) => {
      c.position.set(14.0, 4.0, 30.0);
      c.lookAt(30.0, 6.0, 46.0);
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
    name: 'industrieterrein in de ochtend',
    hour: 8.3,
    height: 330,
    place: (c) => {
      c.position.set(-348, 4.5, 118);
      c.lookAt(-348, 2.0, 160);
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
  // De wereld laadt rond de speler; voor een blik op een andere wijk moet hij
  // eerst weten dat we daar kijken.
  const focus = view.name.includes('industrie') ? extraSpots[0]! : [player.x, player.z];
  world.update(camera, 12, focus[0]!, focus[1]!);
  crowd.update(camera, canvas.width, view.height, 0.016, hour > 19 || hour < 6 ? 1 : 0);
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
    `naambordjes: ${crowd.plates.map((p) => `${p.name} lvl${p.level} @${Math.round(p.x)},${Math.round(p.y)}`).join(' | ')}`,
    errors.length ? `FOUTEN: ${errors.join(' | ')}` : 'geen fouten',
  ].join('\n');
}

window.__preview.info = JSON.stringify({ calls: renderer.info.render.calls, errors: errors.length });
document.title = errors.length ? `FOUT: ${errors[0]}` : 'ok';
