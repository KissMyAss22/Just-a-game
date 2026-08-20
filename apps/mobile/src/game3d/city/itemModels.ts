import { ITEMS, itemHeight, rotatedFootprint } from '@game/shared';
import * as THREE from 'three';
import { mergeParts, standingBox, standingCylinder, type Part } from './geometry';

/**
 * Een 3D-model per item, in plaats van voor alles hetzelfde blokje.
 *
 * Alles wordt opgebouwd uit primitieven met de kleur in de punten gebakken —
 * dezelfde bouwdoos als het straatmeubilair. Geen enkel model komt van buiten:
 * een 3D-bestand meesturen kost bundelgrootte en laadtijd, en met veertig
 * items zou dat hard oplopen.
 *
 * De maten staan in **meters op ware grootte**: een vloerlamp is 1,5 meter, een
 * goudstaaf 25 centimeter. Daardoor klopt een voorwerp meteen als het in je
 * woning staat. Op straat wordt het model daarna naar een vaste hoogte
 * geschaald, want daar moet je een muntje net zo goed zien liggen als een
 * vleugel.
 */

// Kleuren die vaker terugkomen. Losse namen lezen prettiger dan hexcodes.
const C = {
  staal: '#9aa1a9',
  donkerStaal: '#3d434a',
  zwart: '#1b1e22',
  hout: '#8a6239',
  donkerHout: '#5a3f26',
  glas: '#8fb9cc',
  donkerGlas: '#16202a',
  goud: '#d8a828',
  koper: '#b06a34',
  wit: '#e8e6e0',
  rood: '#a8322a',
  groen: '#3f7a44',
  blad: '#3f6b33',
  aarde: '#4a3524',
  blauw: '#2f5c8f',
  neon: '#38d6c0',
  paars: '#7d3fa8',
  stof: '#4a5566',
  beton: '#8b8880',
  papier: '#e3d9bd',
} as const;

const box = (w: number, h: number, d: number): THREE.BufferGeometry => standingBox(w, h, d);
const tube = (r: number, h: number, seg = 10): THREE.BufferGeometry =>
  standingCylinder(r, r, h, seg);
/**
 * Een liggende buis: het middelpunt in de oorsprong, zodat draaien om het
 * midden gebeurt. `tube` staat met zijn voet op nul en zou bij een draaiing
 * van negentig graden opzij schuiven.
 */
const pipe = (r: number, length: number, seg = 10): THREE.BufferGeometry =>
  new THREE.CylinderGeometry(r, r, length, seg);
const ball = (r: number, seg = 8): THREE.BufferGeometry => new THREE.SphereGeometry(r, seg, seg - 2);

/**
 * De onderdelenlijst per item. De sleutel is het item-id uit @game/shared, en
 * elk model staat met zijn voet op y = 0.
 */
const MODELS: Record<string, () => Part[]> = {
  // --- gewoon spul ---------------------------------------------------------
  coins: () => [
    { geometry: tube(0.09, 0.012, 14), color: C.goud },
    { geometry: tube(0.09, 0.012, 14), color: '#c9a227', position: [0.03, 0.014, 0.02] },
    { geometry: tube(0.09, 0.012, 14), color: C.goud, position: [-0.02, 0.028, 0.04] },
  ],
  bottle: () => [
    { geometry: tube(0.045, 0.16, 10), color: '#3f7a5c' },
    { geometry: standingCylinder(0.022, 0.045, 0.06, 10), color: '#3f7a5c', position: [0, 0.16, 0] },
    { geometry: tube(0.022, 0.05, 10), color: '#3f7a5c', position: [0, 0.22, 0] },
    { geometry: tube(0.024, 0.02, 10), color: C.wit, position: [0, 0.27, 0] },
  ],
  scrap: () => [
    { geometry: box(0.22, 0.05, 0.16), color: C.staal, rotation: [0, 0.4, 0.1] },
    { geometry: box(0.18, 0.04, 0.2), color: '#7d848c', position: [0.03, 0.05, 0.02], rotation: [0.2, -0.6, 0] },
    { geometry: tube(0.03, 0.14, 8), color: C.donkerStaal, position: [-0.05, 0.06, 0.05], rotation: [0, 0, 1.2] },
  ],
  cardboard: () => [
    { geometry: box(0.34, 0.26, 0.28), color: '#a57c4e' },
    { geometry: box(0.35, 0.02, 0.12), color: '#8a6438', position: [0, 0.26, 0] },
  ],
  old_phone: () => [
    { geometry: box(0.075, 0.015, 0.15), color: C.zwart },
    { geometry: box(0.065, 0.004, 0.13), color: '#2d3d52', position: [0, 0.015, 0] },
  ],
  lamp: () => [
    { geometry: tube(0.16, 0.03, 14), color: C.donkerStaal },
    { geometry: tube(0.025, 1.25, 8), color: C.donkerStaal, position: [0, 0.03, 0] },
    {
      geometry: new THREE.CylinderGeometry(0.16, 0.24, 0.28, 14, 1, true),
      color: '#e8dfc4',
      position: [0, 1.42, 0],
    },
    { geometry: ball(0.06), color: '#fff3d0', position: [0, 1.34, 0] },
  ],
  plant: () => [
    { geometry: standingCylinder(0.16, 0.12, 0.2, 12), color: C.koper },
    { geometry: tube(0.02, 0.3, 6), color: '#4a6b3a', position: [0, 0.2, 0] },
    { geometry: ball(0.16, 7), color: C.blad, position: [0, 0.52, 0], scale: [1, 0.8, 1] },
    { geometry: ball(0.11, 7), color: '#4d7f3e', position: [0.11, 0.44, 0.06] },
    { geometry: ball(0.1, 7), color: '#35592c', position: [-0.1, 0.46, -0.05] },
  ],
  tyre: () => [
    { geometry: new THREE.TorusGeometry(0.26, 0.1, 8, 16), color: C.zwart, position: [0, 0.26, 0], rotation: [Math.PI / 2, 0, 0] },
    { geometry: pipe(0.13, 0.16, 12), color: C.staal, position: [0, 0.26, 0], rotation: [Math.PI / 2, 0, 0] },
  ],

  // --- materiaal en onderdelen --------------------------------------------
  toolbox: () => [
    { geometry: box(0.44, 0.2, 0.22), color: C.rood },
    { geometry: box(0.44, 0.05, 0.22), color: '#7d2620', position: [0, 0.2, 0] },
    { geometry: box(0.16, 0.03, 0.03), color: C.donkerStaal, position: [0, 0.25, 0] },
    { geometry: box(0.03, 0.06, 0.03), color: C.donkerStaal, position: [-0.07, 0.22, 0] },
    { geometry: box(0.03, 0.06, 0.03), color: C.donkerStaal, position: [0.07, 0.22, 0] },
  ],
  copper: () => [
    { geometry: new THREE.TorusGeometry(0.14, 0.05, 8, 14), color: C.koper, position: [0, 0.05, 0], rotation: [Math.PI / 2, 0, 0] },
    { geometry: new THREE.TorusGeometry(0.11, 0.04, 8, 14), color: '#c98040', position: [0, 0.12, 0], rotation: [Math.PI / 2, 0, 0] },
  ],
  sneakers: () => [
    { geometry: box(0.11, 0.07, 0.28), color: C.wit, position: [-0.07, 0, 0] },
    { geometry: box(0.11, 0.02, 0.28), color: C.rood, position: [-0.07, 0.07, 0] },
    { geometry: box(0.11, 0.07, 0.28), color: C.wit, position: [0.07, 0, 0.04] },
    { geometry: box(0.11, 0.02, 0.28), color: C.rood, position: [0.07, 0.07, 0.04] },
  ],
  speaker: () => [
    { geometry: box(0.4, 0.85, 0.34), color: C.zwart },
    { geometry: pipe(0.13, 0.02, 14), color: '#2e3238', position: [0, 0.6, 0.17], rotation: [Math.PI / 2, 0, 0] },
    { geometry: pipe(0.07, 0.02, 12), color: '#2e3238', position: [0, 0.28, 0.17], rotation: [Math.PI / 2, 0, 0] },
    { geometry: box(0.42, 0.03, 0.36), color: C.donkerStaal, position: [0, 0.85, 0] },
  ],
  armchair: () => [
    { geometry: box(0.75, 0.34, 0.72), color: C.stof, position: [0, 0.12, 0] },
    { geometry: box(0.75, 0.5, 0.14), color: '#3f4a58', position: [0, 0.46, -0.29] },
    { geometry: box(0.13, 0.3, 0.72), color: '#3f4a58', position: [-0.31, 0.46, 0] },
    { geometry: box(0.13, 0.3, 0.72), color: '#3f4a58', position: [0.31, 0.46, 0] },
    { geometry: box(0.08, 0.12, 0.08), color: C.donkerHout, position: [-0.28, 0, 0.28] },
    { geometry: box(0.08, 0.12, 0.08), color: C.donkerHout, position: [0.28, 0, 0.28] },
  ],
  headlight: () => [
    { geometry: box(0.26, 0.14, 0.1), color: C.donkerStaal, position: [-0.15, 0, 0] },
    { geometry: box(0.22, 0.11, 0.03), color: '#f2eeda', position: [-0.15, 0.015, 0.05] },
    { geometry: box(0.26, 0.14, 0.1), color: C.donkerStaal, position: [0.15, 0, 0] },
    { geometry: box(0.22, 0.11, 0.03), color: '#f2eeda', position: [0.15, 0.015, 0.05] },
  ],
  season_chip: () => [
    { geometry: box(0.2, 0.012, 0.1), color: '#e05a7a', rotation: [0, 0.2, 0] },
    { geometry: box(0.03, 0.014, 0.1), color: '#b93f5c', position: [0.05, 0, 0], rotation: [0, 0.2, 0] },
  ],
  turbo: () => [
    { geometry: new THREE.CylinderGeometry(0.16, 0.16, 0.12, 14), color: C.staal, position: [0, 0.16, 0], rotation: [Math.PI / 2, 0, 0] },
    { geometry: new THREE.CylinderGeometry(0.05, 0.11, 0.16, 12), color: '#7d848c', position: [0.1, 0.16, 0], rotation: [0, 0, Math.PI / 2] },
    { geometry: pipe(0.06, 0.14, 10), color: C.donkerStaal, position: [0, 0.16, 0.12], rotation: [Math.PI / 2, 0, 0] },
  ],
  crate: () => [
    { geometry: box(0.5, 0.36, 0.4), color: C.hout },
    { geometry: box(0.52, 0.04, 0.42), color: C.donkerHout, position: [0, 0.16, 0] },
    { geometry: box(0.52, 0.04, 0.42), color: C.donkerHout, position: [0, 0.36, 0] },
    { geometry: box(0.06, 0.38, 0.06), color: C.donkerHout, position: [-0.22, 0, 0.17] },
    { geometry: box(0.06, 0.38, 0.06), color: C.donkerHout, position: [0.22, 0, 0.17] },
  ],
  engine_v8: () => [
    { geometry: box(0.42, 0.28, 0.4), color: C.donkerStaal },
    { geometry: box(0.16, 0.22, 0.36), color: C.staal, position: [-0.14, 0.28, 0], rotation: [0.28, 0, 0] },
    { geometry: box(0.16, 0.22, 0.36), color: C.staal, position: [0.14, 0.28, 0], rotation: [-0.28, 0, 0] },
    { geometry: tube(0.05, 0.14, 8), color: C.koper, position: [0, 0.46, 0] },
  ],
  race_ecu: () => [
    { geometry: box(0.26, 0.07, 0.18), color: '#1f6b52' },
    { geometry: box(0.09, 0.04, 0.06), color: C.zwart, position: [-0.05, 0.07, 0] },
    { geometry: box(0.05, 0.03, 0.05), color: C.zwart, position: [0.06, 0.07, 0.04] },
    { geometry: box(0.28, 0.02, 0.04), color: C.goud, position: [0, 0.02, 0.1] },
  ],

  // --- kostbaar ------------------------------------------------------------
  laptop: () => [
    { geometry: box(0.34, 0.02, 0.24), color: '#b9bec4' },
    { geometry: box(0.3, 0.005, 0.2), color: '#2b2f34', position: [0, 0.02, 0] },
    { geometry: box(0.34, 0.22, 0.02), color: '#b9bec4', position: [0, 0.02, -0.12], rotation: [-0.35, 0, 0] },
    { geometry: box(0.3, 0.18, 0.006), color: '#1c2733', position: [0, 0.05, -0.1], rotation: [-0.35, 0, 0] },
  ],
  watch: () => [
    { geometry: new THREE.TorusGeometry(0.09, 0.022, 8, 16), color: C.donkerStaal, position: [0, 0.022, 0], rotation: [Math.PI / 2, 0, 0] },
    { geometry: tube(0.055, 0.03, 14), color: C.goud, position: [0, 0.06, 0] },
    { geometry: tube(0.045, 0.008, 14), color: '#12171d', position: [0, 0.09, 0] },
  ],
  camera: () => [
    { geometry: box(0.26, 0.18, 0.2), color: '#2a2e33' },
    { geometry: new THREE.CylinderGeometry(0.06, 0.07, 0.14, 12), color: C.donkerStaal, position: [0, 0.1, 0.16], rotation: [Math.PI / 2, 0, 0] },
    { geometry: pipe(0.075, 0.03, 14), color: '#101418', position: [0, 0.1, 0.24], rotation: [Math.PI / 2, 0, 0] },
    { geometry: tube(0.09, 0.04, 14), color: '#3a4046', position: [-0.06, 0.2, -0.02] },
    { geometry: tube(0.09, 0.04, 14), color: '#3a4046', position: [0.06, 0.2, -0.02] },
  ],
  gold_bar: () => [
    { geometry: new THREE.CylinderGeometry(0.09, 0.12, 0.09, 4), color: C.goud, position: [0, 0.045, 0], rotation: [0, Math.PI / 4, 0], scale: [1.7, 1, 1] },
  ],
  safe: () => [
    { geometry: box(0.34, 0.36, 0.3), color: '#333a42' },
    { geometry: box(0.3, 0.32, 0.03), color: '#414a54', position: [0, 0.02, 0.15] },
    { geometry: pipe(0.06, 0.03, 14), color: C.staal, position: [0, 0.18, 0.18], rotation: [Math.PI / 2, 0, 0] },
    { geometry: box(0.02, 0.11, 0.02), color: C.staal, position: [0, 0.18, 0.2] },
    { geometry: box(0.11, 0.02, 0.02), color: C.staal, position: [0, 0.18, 0.2] },
  ],
  jet_ski: () => [
    { geometry: box(1.9, 0.34, 0.72), color: '#d8d5ce' },
    { geometry: box(1.1, 0.22, 0.6), color: C.blauw, position: [-0.2, 0.34, 0] },
    { geometry: box(0.5, 0.16, 0.44), color: '#2b3038', position: [-0.5, 0.56, 0] },
    { geometry: box(0.1, 0.26, 0.08), color: '#2b3038', position: [0.35, 0.5, 0], rotation: [0, 0, -0.3] },
    { geometry: box(0.08, 0.06, 0.5), color: '#2b3038', position: [0.4, 0.7, 0] },
  ],
  diamond: () => [
    { geometry: new THREE.OctahedronGeometry(0.14, 0), color: '#bfe6f5', position: [0, 0.14, 0], scale: [1, 1.25, 1] },
  ],
  meteorite: () => [
    { geometry: new THREE.IcosahedronGeometry(0.2, 0), color: '#3a3630', position: [0, 0.2, 0] },
    { geometry: new THREE.IcosahedronGeometry(0.09, 0), color: '#6b5f4a', position: [0.14, 0.28, 0.06] },
    { geometry: ball(0.05, 6), color: '#c98a3a', position: [-0.1, 0.26, 0.12] },
  ],
  crown: () => [
    { geometry: new THREE.CylinderGeometry(0.16, 0.15, 0.1, 12, 1, true), color: C.goud, position: [0, 0.05, 0] },
    { geometry: tube(0.165, 0.03, 12), color: '#e8bf3e', position: [0, 0, 0] },
    ...[0, 1, 2, 3, 4].map((i): Part => ({
      geometry: new THREE.ConeGeometry(0.04, 0.11, 4),
      color: C.goud,
      position: [Math.sin((i / 5) * Math.PI * 2) * 0.15, 0.155, Math.cos((i / 5) * Math.PI * 2) * 0.15],
    })),
    ...[0, 1, 2].map((i): Part => ({
      geometry: ball(0.028, 6),
      color: '#c0304a',
      position: [Math.sin((i / 3) * Math.PI * 2) * 0.155, 0.06, Math.cos((i / 3) * Math.PI * 2) * 0.155],
    })),
  ],

  // --- meubels en decor ----------------------------------------------------
  aquarium: () => [
    { geometry: box(1.1, 0.6, 0.42), color: C.donkerHout },
    { geometry: box(1.06, 0.62, 0.38), color: C.glas, position: [0, 0.6, 0] },
    { geometry: box(1.06, 0.06, 0.38), color: '#c8b78a', position: [0, 0.6, 0] },
    { geometry: box(1.1, 0.06, 0.42), color: C.donkerStaal, position: [0, 1.22, 0] },
    { geometry: ball(0.05, 6), color: '#e08a2c', position: [-0.2, 0.9, 0], scale: [1.6, 1, 0.6] },
    { geometry: ball(0.04, 6), color: '#4fb0d8', position: [0.25, 1.02, 0.05], scale: [1.6, 1, 0.6] },
    { geometry: tube(0.02, 0.3, 6), color: C.groen, position: [0.35, 0.66, -0.08] },
  ],
  arcade: () => [
    { geometry: box(0.7, 1.5, 0.7), color: '#2b2f52' },
    { geometry: box(0.62, 0.5, 0.06), color: '#12141f', position: [0, 0.95, 0.33], rotation: [0.25, 0, 0] },
    { geometry: box(0.66, 0.16, 0.3), color: '#3a3f66', position: [0, 0.78, 0.28], rotation: [0.4, 0, 0] },
    { geometry: tube(0.02, 0.09, 6), color: C.rood, position: [-0.14, 0.9, 0.34] },
    { geometry: ball(0.03, 6), color: C.rood, position: [-0.14, 0.99, 0.34] },
    { geometry: ball(0.025, 6), color: '#e0c63a', position: [0.1, 0.9, 0.34] },
    { geometry: box(0.7, 0.2, 0.7), color: C.neon, position: [0, 1.5, 0] },
  ],
  painting: () => [
    { geometry: box(0.9, 0.7, 0.06), color: C.goud },
    { geometry: box(0.78, 0.58, 0.03), color: '#4a6b8a', position: [0, 0.06, 0.03] },
    { geometry: box(0.3, 0.2, 0.01), color: '#c07a4a', position: [-0.12, 0.2, 0.05], rotation: [0, 0, 0.3] },
    { geometry: box(0.25, 0.3, 0.01), color: '#3f5a3a', position: [0.16, 0.14, 0.05] },
  ],
  piano: () => [
    { geometry: box(1.5, 0.24, 1.9), color: '#14171b', position: [0, 0.62, 0] },
    { geometry: box(1.4, 0.1, 0.34), color: C.wit, position: [0, 0.56, 0.9] },
    { geometry: box(1.4, 0.04, 0.18), color: '#101216', position: [0, 0.62, 0.98] },
    { geometry: tube(0.06, 0.62, 8), color: '#14171b', position: [-0.6, 0, 0.75] },
    { geometry: tube(0.06, 0.62, 8), color: '#14171b', position: [0.6, 0, 0.75] },
    { geometry: tube(0.06, 0.62, 8), color: '#14171b', position: [0, 0, -0.75] },
    { geometry: box(1.3, 0.05, 1.6), color: '#22262c', position: [0.1, 0.86, -0.1], rotation: [0, 0, 0.35] },
  ],
  sculpture: () => [
    { geometry: box(0.42, 0.16, 0.42), color: '#2b2e33' },
    { geometry: standingCylinder(0.1, 0.16, 0.5, 10), color: '#8a6a34', position: [0, 0.16, 0] },
    { geometry: ball(0.14, 8), color: '#9c7a3c', position: [0, 0.78, 0], scale: [1, 1.2, 0.8] },
    { geometry: box(0.08, 0.3, 0.08), color: '#8a6a34', position: [-0.16, 0.5, 0], rotation: [0, 0, 0.7] },
  ],
  chandelier: () => [
    { geometry: tube(0.02, 0.35, 6), color: C.goud, position: [0, 0.55, 0] },
    { geometry: new THREE.CylinderGeometry(0.3, 0.18, 0.12, 12, 1, true), color: C.goud, position: [0, 0.42, 0] },
    ...[0, 1, 2, 3, 4, 5].map((i): Part => ({
      geometry: new THREE.ConeGeometry(0.05, 0.16, 6),
      color: '#f2e6c0',
      position: [
        Math.sin((i / 6) * Math.PI * 2) * 0.26,
        0.26,
        Math.cos((i / 6) * Math.PI * 2) * 0.26,
      ],
      rotation: [Math.PI, 0, 0],
    })),
    { geometry: new THREE.OctahedronGeometry(0.08, 0), color: '#e8f2ff', position: [0, 0.1, 0] },
  ],
  workbench: () => [
    { geometry: box(1.4, 0.08, 0.6), color: C.hout, position: [0, 0.82, 0] },
    { geometry: box(0.08, 0.82, 0.08), color: C.donkerStaal, position: [-0.62, 0, -0.24] },
    { geometry: box(0.08, 0.82, 0.08), color: C.donkerStaal, position: [0.62, 0, -0.24] },
    { geometry: box(0.08, 0.82, 0.08), color: C.donkerStaal, position: [-0.62, 0, 0.24] },
    { geometry: box(0.08, 0.82, 0.08), color: C.donkerStaal, position: [0.62, 0, 0.24] },
    { geometry: box(1.3, 0.5, 0.06), color: '#6d757e', position: [0, 0.9, -0.28] },
    { geometry: box(0.22, 0.05, 0.05), color: C.rood, position: [-0.3, 0.9, 0.1], rotation: [0, 0.4, 0] },
    { geometry: box(0.16, 0.1, 0.1), color: C.staal, position: [0.35, 0.9, 0.05] },
  ],
  neon_sign: () => [
    { geometry: box(0.9, 0.5, 0.06), color: '#14171b' },
    { geometry: box(0.72, 0.09, 0.03), color: C.neon, position: [0, 0.32, 0.05] },
    { geometry: box(0.5, 0.09, 0.03), color: '#e0407a', position: [-0.08, 0.18, 0.05] },
    { geometry: box(0.36, 0.09, 0.03), color: '#e0c63a', position: [0.1, 0.06, 0.05] },
  ],
  home_gym: () => [
    { geometry: box(1.2, 0.12, 0.7), color: C.zwart },
    { geometry: box(0.1, 1.1, 0.1), color: C.donkerStaal, position: [-0.5, 0.12, -0.28] },
    { geometry: box(0.1, 1.1, 0.1), color: C.donkerStaal, position: [0.5, 0.12, -0.28] },
    { geometry: box(1.1, 0.08, 0.08), color: C.staal, position: [0, 0.95, -0.28] },
    { geometry: box(0.5, 0.16, 0.4), color: '#2f3a4a', position: [0, 0.45, 0.1], rotation: [0.15, 0, 0] },
    { geometry: pipe(0.16, 0.06, 12), color: C.donkerStaal, position: [-0.42, 0.2, 0.1], rotation: [0, 0, Math.PI / 2] },
    { geometry: pipe(0.16, 0.06, 12), color: C.donkerStaal, position: [0.42, 0.2, 0.1], rotation: [0, 0, Math.PI / 2] },
  ],
  race_sim: () => [
    { geometry: box(1.3, 0.1, 1.5), color: C.donkerStaal },
    { geometry: box(0.6, 0.16, 0.55), color: C.rood, position: [0, 0.3, -0.3] },
    { geometry: box(0.55, 0.7, 0.14), color: C.rood, position: [0, 0.4, -0.58], rotation: [-0.25, 0, 0] },
    { geometry: box(0.1, 0.4, 0.1), color: C.staal, position: [0, 0.4, 0.4], rotation: [0.5, 0, 0] },
    { geometry: new THREE.TorusGeometry(0.16, 0.03, 6, 14), color: C.zwart, position: [0, 0.75, 0.5], rotation: [0.5, 0, 0] },
    { geometry: box(1.0, 0.6, 0.06), color: '#12161c', position: [0, 0.85, 0.72], rotation: [0.12, 0, 0] },
  ],
  art_wall: () => [
    { geometry: box(1.4, 1.5, 0.08), color: '#2f3138' },
    { geometry: box(0.4, 0.5, 0.03), color: '#b8452f', position: [-0.42, 0.85, 0.06] },
    { geometry: box(0.3, 0.4, 0.03), color: '#2f6b8a', position: [0.05, 0.95, 0.06] },
    { geometry: box(0.45, 0.3, 0.03), color: '#c9a227', position: [0.42, 0.55, 0.06] },
    { geometry: box(0.28, 0.28, 0.03), color: '#4a7a4a', position: [-0.3, 0.35, 0.06] },
  ],
  trophy_case: () => [
    { geometry: box(1.1, 1.8, 0.42), color: C.donkerHout },
    { geometry: box(1.0, 1.5, 0.02), color: C.glas, position: [0, 0.2, 0.21] },
    { geometry: box(1.0, 0.04, 0.36), color: C.donkerHout, position: [0, 0.6, 0] },
    { geometry: box(1.0, 0.04, 0.36), color: C.donkerHout, position: [0, 1.1, 0] },
    { geometry: standingCylinder(0.09, 0.05, 0.16, 10), color: C.goud, position: [-0.25, 0.64, 0] },
    { geometry: tube(0.03, 0.1, 8), color: C.goud, position: [-0.25, 0.8, 0] },
    { geometry: ball(0.07, 7), color: C.goud, position: [0.25, 1.2, 0] },
  ],
  private_vault: () => [
    { geometry: box(1.0, 1.6, 0.7), color: '#2b3138' },
    { geometry: box(0.9, 1.4, 0.05), color: '#3c444d', position: [0, 0.1, 0.35] },
    { geometry: pipe(0.22, 0.08, 16), color: C.staal, position: [0, 0.8, 0.4], rotation: [Math.PI / 2, 0, 0] },
    { geometry: box(0.05, 0.4, 0.05), color: C.staal, position: [0, 0.8, 0.44] },
    { geometry: box(0.4, 0.05, 0.05), color: C.staal, position: [0, 0.8, 0.44] },
    { geometry: pipe(0.06, 0.04, 12), color: C.goud, position: [0, 0.8, 0.46], rotation: [Math.PI / 2, 0, 0] },
  ],
  city_deed: () => [
    { geometry: pipe(0.06, 0.5, 12), color: C.papier, rotation: [0, 0, Math.PI / 2], position: [0, 0.06, 0] },
    { geometry: box(0.44, 0.008, 0.3), color: C.papier, position: [0, 0.12, 0.14], rotation: [0.15, 0, 0] },
    { geometry: tube(0.035, 0.03, 10), color: C.rood, position: [0.12, 0.13, 0.22] },
    { geometry: box(0.3, 0.004, 0.02), color: '#6b6455', position: [-0.02, 0.13, 0.1], rotation: [0.15, 0, 0] },
  ],
  season_key: () => [
    { geometry: new THREE.TorusGeometry(0.06, 0.018, 6, 12), color: C.goud, position: [0, 0.018, -0.1], rotation: [Math.PI / 2, 0, 0] },
    { geometry: box(0.025, 0.018, 0.26), color: C.goud, position: [0, 0, 0.06] },
    { geometry: box(0.025, 0.018, 0.05), color: C.goud, position: [0.03, 0, 0.16] },
    { geometry: box(0.025, 0.018, 0.05), color: C.goud, position: [0.03, 0, 0.05] },
  ],
};

/** Als er geen model is: een kist. Beter dan niets, en meteen zichtbaar. */
const FALLBACK = MODELS.crate!;

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * De geometrie van een item, op ware grootte en staand op y = 0.
 * Wordt één keer gebouwd en daarna hergebruikt.
 */
export function itemGeometry(itemId: string): THREE.BufferGeometry {
  const cached = cache.get(itemId);
  if (cached) return cached;
  const parts = (MODELS[itemId] ?? FALLBACK)();
  const geometry = mergeParts(parts);
  cache.set(itemId, geometry);
  return geometry;
}

/** De maten van een model, zodat het geschaald kan worden waar het moet passen. */
export function itemBounds(itemId: string): THREE.Vector3 {
  const geometry = itemGeometry(itemId);
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox!.getSize(size);
  return size;
}

/**
 * Hoe groot een item op straat wordt getekend.
 *
 * Op ware grootte zou een muntje onvindbaar zijn en een vleugel de halve straat
 * vullen. Alles wordt daarom naar ongeveer dezelfde hoogte geschaald — groot
 * genoeg om te zien, klein genoeg om niet in de weg te staan — maar met een
 * beetje ruimte voor het verschil, zodat een goudstaaf nog steeds forser oogt
 * dan een fles.
 */
export function lootScale(itemId: string): number {
  const size = itemBounds(itemId);
  const largest = Math.max(size.x, size.y, size.z, 0.01);
  const target = 0.75;
  // De wortel dempt het verschil: een piano wordt niet vijftien keer zo klein
  // als een munt, alleen wat kleiner geschaald.
  return (target / largest) ** 0.85;
}

/**
 * Hoe groot een item in je woning wordt getekend: passend binnen zijn vakje,
 * en niet hoger dan wat de plattegrond ervoor reserveert.
 */
export function interiorScale(itemId: string, rotation: number, cellSize: number): number {
  const size = itemBounds(itemId);
  const { w, d } = rotatedFootprint(itemId, rotation);
  const room = { x: w * cellSize * 0.86, y: itemHeight(itemId), z: d * cellSize * 0.86 };
  return Math.min(
    room.x / Math.max(size.x, 0.01),
    room.y / Math.max(size.y, 0.01),
    room.z / Math.max(size.z, 0.01),
  );
}

/** Elk item-id waarvoor een eigen model bestaat. Voor de renderproef. */
export function modelledItemIds(): string[] {
  return ITEMS.filter((item) => MODELS[item.id]).map((item) => item.id);
}

/** Items die nog met de terugvaloptie worden getekend. */
export function itemsWithoutModel(): string[] {
  return ITEMS.filter((item) => !MODELS[item.id]).map((item) => item.id);
}
