/**
 * Je woning van binnen, op ooghoogte.
 *
 * De kamers zijn net van 1,2 naar 2,0 meter per cel gegaan zodat je er
 * doorheen kunt lopen. Of dat ook echt ruim genoeg aanvoelt zie je niet aan een
 * getal — daar moet je in staan. Deze pagina zet drie woningen naast elkaar met
 * een figuurtje erin als maatstok.
 */
import {
  HOME_CELL_SIZE,
  HOME_WALL_HEIGHT,
  doorCell,
  floorPlanFor,
  homeCellToWorld,
  homeEntrance,
  placedItemCenter,
  type FloorPlan,
  type PlacedItem,
} from '@game/shared';
import * as THREE from 'three';
import { createCharacter } from '../../apps/mobile/src/game3d/city/character';
import { interiorScale, itemGeometry } from '../../apps/mobile/src/game3d/city/itemModels';

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
renderer.toneMappingExposure = 1.0;
renderer.setClearColor('#0b1020');
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(new THREE.Color('#e2ecff'), new THREE.Color('#2a2620'), 1.1));
const key = new THREE.DirectionalLight(new THREE.Color('#fff2dd'), 2.2);
key.position.set(7, 13, 6);
key.castShadow = true;
scene.add(key);

const wallMaterial = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
const floorMaterial = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.02 });
const furnitureMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.55,
  metalness: 0.12,
});

/** Bouwt één woning op, met de deur naar de camera toe. */
function buildRoom(plan: FloorPlan, placements: PlacedItem[]): THREE.Group {
  const group = new THREE.Group();
  const width = plan.width * HOME_CELL_SIZE;
  const depth = plan.depth * HOME_CELL_SIZE;

  const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, depth), floorMaterial.clone());
  (floor.material as THREE.MeshStandardMaterial).color.set(plan.floorColor);
  floor.receiveShadow = true;
  group.add(floor);

  // Alleen de achterste en de zijmuren: de voormuur zou het beeld dichtzetten,
  // en in de app verdwijnt hij om precies dezelfde reden.
  const walls: [number, number, number, number, number][] = [
    [0, -depth / 2, width, 0.12, 0],
    [-width / 2, 0, 0.12, depth, 0],
    [width / 2, 0, 0.12, depth, 0],
  ];
  for (const [x, z, w, d] of walls) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(w, HOME_WALL_HEIGHT, d),
      wallMaterial.clone(),
    );
    (wall.material as THREE.MeshStandardMaterial).color.set(plan.wallColor);
    wall.position.set(x, HOME_WALL_HEIGHT / 2, z);
    wall.castShadow = true;
    group.add(wall);
  }

  for (const placed of placements) {
    const box = placedItemCenter(plan, placed);
    const mesh = new THREE.Mesh(itemGeometry(placed.itemId), furnitureMaterial);
    mesh.scale.setScalar(interiorScale(placed.itemId, placed.rotation, HOME_CELL_SIZE));
    mesh.rotation.y = (placed.rotation * Math.PI) / 2;
    mesh.position.set(box.x, 0.06, box.z);
    mesh.castShadow = true;
    group.add(mesh);
  }

  // Een figuurtje bij de deur, als maatstok: is dit een kamer of een kast?
  const entrance = homeEntrance(plan);
  const person = createCharacter({ skin: '#c89066', outfit: '#2f6f5e', accent: '#e0b64a' }, true);
  person.group.position.set(entrance.x, 0.06, entrance.z);
  person.group.rotation.y = Math.PI;
  person.update(0.016, 0, 0, 0);
  group.add(person.group);

  return group;
}

const spullen = (plan: FloorPlan, ids: string[]): PlacedItem[] => {
  const door = doorCell(plan);
  const out: PlacedItem[] = [];
  let index = 0;
  for (let z = 0; z < plan.depth && index < ids.length; z++) {
    for (let x = 0; x < plan.width && index < ids.length; x++) {
      if (x === door.x && z === door.z) continue;
      out.push({ id: `p${index}`, itemId: ids[index]!, x, z, rotation: 0 });
      index++;
    }
  }
  return out;
};

const views = [
  { property: 'squat', naam: 'Krot', ids: ['lamp', 'plant', 'armchair'] },
  {
    property: 'apartment',
    naam: 'Appartement',
    ids: ['armchair', 'lamp', 'plant', 'aquarium', 'speaker', 'painting', 'neon_sign', 'watch'],
  },
  {
    property: 'villa',
    naam: 'Villa',
    ids: [
      'piano',
      'armchair',
      'lamp',
      'plant',
      'aquarium',
      'arcade',
      'home_gym',
      'painting',
      'chandelier',
      'trophy_case',
      'speaker',
      'sculpture',
    ],
  },
];

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 120);
const rowHeight = canvas.height / views.length;
renderer.setScissorTest(true);

const labels: string[] = [];
views.forEach((view, index) => {
  const plan = floorPlanFor(view.property);
  // De hele opbouw afschermen, niet alleen het renderen. Bij de eerste versie
  // stond hier een filter op itemGeometry, maar die valt niet om op een
  // onbekend id — de plaatsingsfuncties erna wel, en dan stopt de hele proef
  // na de eerste kamer zonder dat er een fout in beeld komt.
  let room: THREE.Group;
  try {
    room = buildRoom(plan, spullen(plan, view.ids));
  } catch (error) {
    errors.push(`${view.naam}: ${String(error)}`);
    return;
  }
  scene.add(room);

  const width = plan.width * HOME_CELL_SIZE;
  const depth = plan.depth * HOME_CELL_SIZE;
  labels.push(`${view.naam}: ${width.toFixed(1)} x ${depth.toFixed(1)} m`);

  // Van achteren over de schouder, zoals de camera in de app hangt.
  const span = Math.max(width, depth);
  camera.aspect = canvas.width / rowHeight;
  camera.fov = 52;
  camera.updateProjectionMatrix();
  camera.position.set(0, Math.min(5.2, 2.6 + span * 0.13), depth / 2 + Math.min(6.5, 3.4 + span * 0.16));
  camera.lookAt(0, 0.9, 0);

  const offset = canvas.height - rowHeight * (index + 1);
  renderer.setViewport(0, offset, canvas.width, rowHeight);
  renderer.setScissor(0, offset, canvas.width, rowHeight);
  try {
    renderer.render(scene, camera);
  } catch (error) {
    errors.push(`${view.naam}: ${String(error)}`);
  }
  scene.remove(room);
});

const overlay = document.getElementById('overlay');
if (overlay) {
  overlay.textContent = [
    `celmaat ${HOME_CELL_SIZE} m · muurhoogte ${HOME_WALL_HEIGHT} m`,
    labels.join(' | '),
    errors.length ? `FOUTEN: ${errors.join(' | ')}` : 'geen fouten',
  ].join('\n');
}
document.title = errors.length ? 'FOUT' : 'ok';
