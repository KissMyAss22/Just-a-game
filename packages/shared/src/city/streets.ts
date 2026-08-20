import { CITY, cellToWorld, isWaterCell } from './layout';
import { valueAt } from '../rng';

/**
 * De vorm van de straat: waar ligt asfalt, waar ligt stoep, en wat staat er
 * langs de weg.
 *
 * Dit hoort bij de stadsdata en niet bij de renderer, om dezelfde reden als de
 * rest van `city/`: client en server moeten het eens zijn over de wereld. De
 * hoogte van de stoeprand bepaalt op welke hoogte de speler staat, en die
 * hoogte wil je later ook op de server kunnen narekenen.
 */

function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/** Afstand tussen twee evenwijdige straten, in meters. */
export const ROAD_PERIOD = CITY.blockSize * CITY.cellSize;

/**
 * Waar het hart van de straat ligt binnen zo'n periode.
 *
 * Dit móet uitgerekend worden en niet aangenomen. Een weg ligt op elke cel
 * waarvan de index deelbaar is door de bloklengte, en het middelpunt van cel 0
 * ligt niet op nul: de stad is om de oorsprong heen gecentreerd. Bij de oude
 * bloklengte kwam dat toevallig op precies een halve cel uit, waardoor de
 * aanname jarenlang goed leek — tot de bloklengte veranderde en de stoepen,
 * de belijning en het straatmeubilair acht meter naast de weg belandden.
 */
export const ROAD_CENTER_OFFSET = wrap(
  CITY.cellSize / 2 - (CITY.gridSize / 2) * CITY.cellSize,
  ROAD_PERIOD,
);
/**
 * Halve breedte van het rijdek. De rest van de wegcel is stoep.
 *
 * Zes meter asfalt klinkt smal, maar met geparkeerde auto's aan één kant
 * blijft er ruim vier meter rijstrook over. Bij een smaller rijdek stond je
 * met je auto klem tussen twee rijen geparkeerde auto's, en dat was precies
 * wat er gebeurde toen rijden erbij kwam.
 */
export const ASPHALT_HALF_WIDTH = 3.0;
/** Hoogteverschil tussen rijdek en stoep. */
export const SIDEWALK_HEIGHT = 0.16;
/** Afstand van het hart van de weg tot de rij lantaarns. */
export const LAMP_OFFSET = 3.3;
/** Om de hoeveel meter staat er een lantaarn. */
export const LAMP_SPACING = 24;

/** Afstand tot de dichtstbijzijnde straat-as, in één richting. */
export function distanceToRoadAxis(v: number): number {
  const u = wrap(v - ROAD_CENTER_OFFSET, ROAD_PERIOD);
  return Math.min(u, ROAD_PERIOD - u);
}

/** Het hart van de dichtstbijzijnde straat-as, in één richting. */
export function nearestRoadAxis(v: number): number {
  return Math.round((v - ROAD_CENTER_OFFSET) / ROAD_PERIOD) * ROAD_PERIOD + ROAD_CENTER_OFFSET;
}

/** Ligt dit punt op het rijdek (en dus niet op de stoep)? */
export function isAsphalt(x: number, z: number): boolean {
  return distanceToRoadAxis(x) < ASPHALT_HALF_WIDTH || distanceToRoadAxis(z) < ASPHALT_HALF_WIDTH;
}

/**
 * Op welke hoogte staat de speler hier?
 *
 * Alleen het rijdek ligt op nul; de rest van de stad ligt een stoeprand hoger.
 * Daardoor stap je zichtbaar op en van de stoep af in plaats van over een
 * geschilderde streep te lopen.
 */
export function groundHeightAt(x: number, z: number): number {
  return isAsphalt(x, z) ? 0 : SIDEWALK_HEIGHT;
}

// ---------------------------------------------------------------------------
// Straatmeubilair
// ---------------------------------------------------------------------------

export type PropKind = 'lamp' | 'tree' | 'bench' | 'bin' | 'hydrant' | 'car';

export interface StreetProp {
  kind: PropKind;
  x: number;
  z: number;
  /** Rotatie om de y-as in radialen. */
  rotY: number;
  /** Vermenigvuldiger op de standaardgrootte. */
  scale: number;
  /** 0..1 voor kleur- en vormvariatie in de renderer. */
  variant: number;
}

/**
 * Geparkeerde auto's zijn decor: ze zitten bewust niet in `isWalkable`.
 *
 * Zou dat wel zo zijn, dan verandert de begaanbare wereld, en dan kan de
 * server een speler die nu op een geldige plek staat ineens afkeuren. Dat is
 * het niet waard voor een aangeklede straat.
 */
const CAR_OFFSET = 2.0;
const CAR_SPACING = 20;

function pushLampRow(
  out: StreetProp[],
  axis: 'x' | 'z',
  axisValue: number,
  from: number,
  to: number,
  seed: number,
): void {
  const first = Math.ceil(from / LAMP_SPACING) * LAMP_SPACING;
  for (let along = first; along < to; along += LAMP_SPACING) {
    for (const side of [-1, 1] as const) {
      const x = axis === 'x' ? axisValue + side * LAMP_OFFSET : along;
      const z = axis === 'x' ? along : axisValue + side * LAMP_OFFSET;
      const cell = worldCell(x, z);
      if (isWaterCell(cell.cx, cell.cz)) continue;
      // De lantaarn buigt naar de weg toe.
      const rotY = axis === 'x' ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : side > 0 ? Math.PI : 0;
      out.push({ kind: 'lamp', x, z, rotY, scale: 1, variant: valueAt(seed, x | 0, z | 0) });

      const extra = valueAt(seed + 7, x | 0, z | 0);
      if (extra > 0.86) {
        out.push({ kind: 'bin', x: x + Math.sin(rotY) * 1.1, z: z + Math.cos(rotY) * 1.1, rotY, scale: 1, variant: extra });
      } else if (extra > 0.78) {
        out.push({ kind: 'hydrant', x, z: z + 1.4, rotY: 0, scale: 1, variant: extra });
      } else if (extra < 0.1) {
        out.push({ kind: 'bench', x, z, rotY: rotY + Math.PI / 2, scale: 1, variant: extra });
      }
    }
  }
}

function pushCarRow(
  out: StreetProp[],
  axis: 'x' | 'z',
  axisValue: number,
  from: number,
  to: number,
  seed: number,
): void {
  // Aan één kant parkeren, net als in een smalle straat. Welke kant het is
  // ligt vast per straat, zodat het niet per chunk verspringt.
  const side = valueAt(seed + 21, Math.round(axisValue), axis === 'x' ? 0 : 1) < 0.5 ? -1 : 1;
  const first = Math.ceil(from / CAR_SPACING) * CAR_SPACING;
  for (let along = first; along < to; along += CAR_SPACING) {
    const x = axis === 'x' ? axisValue + side * CAR_OFFSET : along;
    const z = axis === 'x' ? along : axisValue + side * CAR_OFFSET;
    const chance = valueAt(seed + 3, x | 0, z | 0);
    if (chance > 0.5) continue;
    const cell = worldCell(x, z);
    if (isWaterCell(cell.cx, cell.cz)) continue;
    // Een auto langs een noord-zuidstraat staat in de rijrichting.
    const rotY = axis === 'x' ? 0 : Math.PI / 2;
    out.push({ kind: 'car', x, z, rotY, scale: 1, variant: valueAt(seed + 4, x | 0, z | 0) });
  }
}

function worldCell(x: number, z: number): { cx: number; cz: number } {
  const half = CITY.gridSize / 2;
  return { cx: Math.floor(x / CITY.cellSize) + half, cz: Math.floor(z / CITY.cellSize) + half };
}

/**
 * Alle lantaarns, banken, prullenbakken en geparkeerde auto's binnen een
 * rechthoek. Deterministisch: dezelfde rechthoek geeft altijd dezelfde straat.
 */
export function streetPropsIn(
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  seed = CITY.seed,
): StreetProp[] {
  const out: StreetProp[] = [];

  const firstAxisX = nearestRoadAxis(minX);
  for (let ax = firstAxisX; ax < maxX + ROAD_PERIOD; ax += ROAD_PERIOD) {
    if (ax < minX - ASPHALT_HALF_WIDTH || ax > maxX + ASPHALT_HALF_WIDTH) continue;
    pushLampRow(out, 'x', ax, minZ, maxZ, seed);
    pushCarRow(out, 'x', ax, minZ, maxZ, seed);
  }

  const firstAxisZ = nearestRoadAxis(minZ);
  for (let az = firstAxisZ; az < maxZ + ROAD_PERIOD; az += ROAD_PERIOD) {
    if (az < minZ - ASPHALT_HALF_WIDTH || az > maxZ + ASPHALT_HALF_WIDTH) continue;
    pushLampRow(out, 'z', az, minX, maxX, seed);
    pushCarRow(out, 'z', az, minX, maxX, seed);
  }

  return out;
}

/** Bomen op een groen perceel: één tot drie, altijd op dezelfde plek. */
export function treesOnLot(centerX: number, centerZ: number, size: number, seed = CITY.seed): StreetProp[] {
  const count = 1 + Math.floor(valueAt(seed + 11, centerX | 0, centerZ | 0) * 3);
  const out: StreetProp[] = [];
  for (let i = 0; i < count; i++) {
    const a = valueAt(seed + 12 + i, centerX | 0, centerZ | 0);
    const b = valueAt(seed + 20 + i, centerX | 0, centerZ | 0);
    out.push({
      kind: 'tree',
      x: centerX + (a - 0.5) * size * 0.6,
      z: centerZ + (b - 0.5) * size * 0.6,
      rotY: a * Math.PI * 2,
      scale: 0.8 + b * 0.6,
      variant: valueAt(seed + 30 + i, centerX | 0, centerZ | 0),
    });
  }
  return out;
}

/** Het middelpunt van de cel waarin een punt ligt; handig voor de renderer. */
export function cellCenter(x: number, z: number): { x: number; z: number } {
  const { cx, cz } = worldCell(x, z);
  return cellToWorld(cx, cz);
}
