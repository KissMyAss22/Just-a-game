/**
 * Alle itemmodellen naast elkaar, met hun naam eronder.
 *
 * Dit is de enige manier om te controleren of een model bij zijn naam past.
 * Een test kan hooguit vaststellen dát er geometrie is; of een "Vloerlamp" er
 * ook als een vloerlamp uitziet moet je zien.
 */
import { ITEMS, getItem } from '@game/shared';
import * as THREE from 'three';
import {
  itemBounds,
  itemGeometry,
  itemsWithoutModel,
} from '../../apps/mobile/src/game3d/city/itemModels';

declare global {
  interface Window {
    __preview?: { errors: string[]; info: string };
  }
}

const errors: string[] = [];
window.__preview = { errors, info: '' };
const nativeError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  errors.push(args.map((a) => String(a)).join(' ').slice(0, 300));
  nativeError(...args);
};

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(canvas.width, canvas.height, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.setClearColor('#161a20');

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(new THREE.Color('#cfe0ff'), new THREE.Color('#3a3630'), 1.5));
const key = new THREE.DirectionalLight(new THREE.Color('#fff2dd'), 2.4);
key.position.set(3, 6, 4);
scene.add(key);
const fill = new THREE.DirectionalLight(new THREE.Color('#9db4d8'), 0.7);
fill.position.set(-4, 2, -3);
scene.add(fill);

const material = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.5,
  metalness: 0.18,
});

/** Elk item in een eigen vakje, allemaal op dezelfde schaal gebracht. */
const COLUMNS = 7;
const CELL = 1.6;
const items = [...ITEMS];

items.forEach((item, index) => {
  const column = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  const geometry = itemGeometry(item.id);
  const size = itemBounds(item.id);
  const largest = Math.max(size.x, size.y, size.z, 0.01);
  const scale = (CELL * 0.62) / largest;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(scale);
  mesh.position.set((column - (COLUMNS - 1) / 2) * CELL, 0, row * CELL);
  mesh.rotation.y = -0.6;
  scene.add(mesh);

  // Een vloertje eronder, zodat je ziet waar het model op staat.
  const tile = new THREE.Mesh(
    new THREE.PlaneGeometry(CELL * 0.9, CELL * 0.9),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a2f38'), roughness: 1 }),
  );
  tile.rotation.x = -Math.PI / 2;
  tile.position.set(mesh.position.x, -0.005, mesh.position.z);
  scene.add(tile);
});

const rows = Math.ceil(items.length / COLUMNS);
const camera = new THREE.PerspectiveCamera(38, canvas.width / canvas.height, 0.1, 200);
camera.position.set(0, rows * 1.35 + 4, rows * CELL * 0.5 + 7.5);
camera.lookAt(0, 0, ((rows - 1) * CELL) / 2);

try {
  renderer.render(scene, camera);
} catch (error) {
  errors.push(String(error));
}

const overlay = document.getElementById('overlay');
if (overlay) {
  const missing = itemsWithoutModel();
  overlay.textContent = [
    `${items.length} items, van linksboven naar rechtsonder: ${items.map((i) => getItem(i.id).name).join(' · ')}`,
    missing.length ? `ZONDER EIGEN MODEL: ${missing.join(', ')}` : 'elk item heeft een eigen model',
    errors.length ? `FOUTEN: ${errors.join(' | ')}` : 'geen fouten',
  ].join('\n');
}
document.title = errors.length ? 'FOUT' : 'ok';
