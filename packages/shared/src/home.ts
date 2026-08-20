import { getItem, type LootItemDef } from './items';
import { PROPERTIES } from './properties';

/**
 * Het interieur van je woning.
 *
 * Net als de stad is dit *data*: een raster van cellen met een deur, waar
 * meubels een echte plek innemen. Server en app rekenen met exact deze
 * functies, dus ze zijn het altijd eens over of iets past.
 *
 * Het aantal vrije cellen ís de capaciteit van je woning — er is geen apart
 * "aantal plekken" meer dat daarnaast kan gaan afwijken.
 */

/**
 * Meters per cel.
 *
 * Twee meter, en dat is een bewuste keuze: je loopt door je woning heen, en op
 * de oude 1,2 m was een krot 2,4 bij 2,4 meter — een bezemkast waar je tegen de
 * muur staat voordat je een stap hebt gezet.
 *
 * Alleen de célmaat is veranderd, niet het aantal cellen. Het aantal plekken
 * van een woning ís `width × depth − 1`, dus daar hangt het inkomen aan; groter
 * maken door er cellen bij te doen zou de hele balans verschuiven. Zo blijft
 * alles staan en wordt een woning kopen ook ruimtelijk voelbaar.
 */
export const HOME_CELL_SIZE = 2.0;
/** Hoogte van de muren in meters. */
export const HOME_WALL_HEIGHT = 2.6;

export interface FloorPlan {
  /** Cellen in x-richting (breedte). */
  width: number;
  /** Cellen in z-richting (diepte). */
  depth: number;
  floorColor: string;
  wallColor: string;
}

/**
 * De deur zit midden in de onderste muur. Die cel blijft vrij, zodat je
 * jezelf nooit kunt inbouwen.
 */
export function doorCell(plan: FloorPlan): { x: number; z: number } {
  return { x: Math.floor(plan.width / 2), z: plan.depth - 1 };
}

export const FLOOR_PLANS: Readonly<Record<string, FloorPlan>> = {
  squat: { width: 2, depth: 2, floorColor: '#4a4038', wallColor: '#6b5b4a' },
  studio: { width: 3, depth: 2, floorColor: '#5a4a3a', wallColor: '#7d6a54' },
  apartment: { width: 3, depth: 3, floorColor: '#6b5540', wallColor: '#8d7658' },
  townhouse: { width: 4, depth: 3, floorColor: '#7a5f42', wallColor: '#9c8465' },
  loft: { width: 4, depth: 4, floorColor: '#5c5c66', wallColor: '#8a8a96' },
  villa: { width: 5, depth: 5, floorColor: '#8a7358', wallColor: '#c3b199' },
  penthouse: { width: 6, depth: 5, floorColor: '#3f4552', wallColor: '#6f7a8d' },
  mansion: { width: 6, depth: 6, floorColor: '#7d6647', wallColor: '#d0bd9c' },
  island_estate: { width: 8, depth: 6, floorColor: '#a08a63', wallColor: '#efe0c4' },
};

export function floorPlanFor(propertyId: string): FloorPlan {
  const plan = FLOOR_PLANS[propertyId];
  if (!plan) throw new Error(`Geen plattegrond voor woning: ${propertyId}`);
  return plan;
}

/** Hoeveel cellen er te vergeven zijn: alles behalve de deur. */
export function placeableCells(plan: FloorPlan): number {
  return plan.width * plan.depth - 1;
}

/** Het aantal plekken van een woning, afgeleid uit de plattegrond. */
export function propertySlots(propertyId: string): number {
  return placeableCells(floorPlanFor(propertyId));
}

// ---------------------------------------------------------------------------
// Afmetingen van meubels
// ---------------------------------------------------------------------------

export interface Footprint {
  w: number;
  d: number;
}

/** Grote spullen nemen meer ruimte in; de rest is één cel. */
const FOOTPRINTS: Readonly<Record<string, Footprint>> = {
  aquarium: { w: 2, d: 1 },
  arcade: { w: 2, d: 1 },
  piano: { w: 2, d: 2 },
  workbench: { w: 2, d: 1 },
  home_gym: { w: 2, d: 1 },
  race_sim: { w: 2, d: 2 },
  art_wall: { w: 2, d: 1 },
  trophy_case: { w: 2, d: 1 },
  sculpture: { w: 1, d: 1 },
  city_deed: { w: 1, d: 1 },
};

export function itemFootprint(itemId: string): Footprint {
  return FOOTPRINTS[itemId] ?? { w: 1, d: 1 };
}

/** Kan dit item überhaupt in je base staan? */
export function isPlaceable(item: LootItemDef): boolean {
  return Boolean(item.incomePerHour || item.flex);
}

// ---------------------------------------------------------------------------
// Plaatsen
// ---------------------------------------------------------------------------

/** Een geplaatst voorwerp: één rij per object, met een echte plek. */
export interface PlacedItem {
  id: string;
  itemId: string;
  /** Cel linksboven van het voorwerp. */
  x: number;
  z: number;
  /** Kwartslagen met de klok mee: 0, 1, 2 of 3. */
  rotation: number;
}

/** De afmeting na draaien; een kwartslag wisselt breedte en diepte om. */
export function rotatedFootprint(itemId: string, rotation: number): Footprint {
  const base = itemFootprint(itemId);
  return rotation % 2 === 0 ? base : { w: base.d, d: base.w };
}

/** Alle cellen die een voorwerp bezet. */
export function cellsFor(itemId: string, x: number, z: number, rotation: number): {
  x: number;
  z: number;
}[] {
  const { w, d } = rotatedFootprint(itemId, rotation);
  const cells: { x: number; z: number }[] = [];
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) cells.push({ x: x + dx, z: z + dz });
  }
  return cells;
}

export type PlacementProblem =
  | 'not_placeable'
  | 'outside'
  | 'blocks_door'
  | 'overlaps';

export const PLACEMENT_PROBLEM_MESSAGE: Readonly<Record<PlacementProblem, string>> = {
  not_placeable: 'Dit item kun je niet in je base zetten.',
  outside: 'Dat past niet binnen de muren.',
  blocks_door: 'Daar zit de deur.',
  overlaps: 'Daar staat al iets.',
};

/**
 * Mag dit voorwerp hier staan? Eén functie voor de server (die beslist) en de
 * app (die de plek alvast rood kleurt).
 */
export function checkPlacement(
  plan: FloorPlan,
  existing: readonly PlacedItem[],
  itemId: string,
  x: number,
  z: number,
  rotation: number,
  /** Bij verplaatsen: het voorwerp dat zichzelf niet in de weg mag zitten. */
  ignoreId?: string,
): { ok: true } | { ok: false; problem: PlacementProblem } {
  if (!isPlaceable(getItem(itemId))) return { ok: false, problem: 'not_placeable' };

  const cells = cellsFor(itemId, x, z, rotation);
  const door = doorCell(plan);

  for (const cell of cells) {
    if (cell.x < 0 || cell.z < 0 || cell.x >= plan.width || cell.z >= plan.depth) {
      return { ok: false, problem: 'outside' };
    }
    if (cell.x === door.x && cell.z === door.z) return { ok: false, problem: 'blocks_door' };
  }

  const taken = new Set<string>();
  for (const placed of existing) {
    if (ignoreId && placed.id === ignoreId) continue;
    for (const cell of cellsFor(placed.itemId, placed.x, placed.z, placed.rotation)) {
      taken.add(`${cell.x}:${cell.z}`);
    }
  }
  for (const cell of cells) {
    if (taken.has(`${cell.x}:${cell.z}`)) return { ok: false, problem: 'overlaps' };
  }

  return { ok: true };
}

/**
 * Zoekt de eerste vrije plek, van linksboven naar rechtsonder. Wordt gebruikt
 * door de "plaats"-knop en door de migratie die oude placements een plek geeft.
 */
export function findFreeSpot(
  plan: FloorPlan,
  existing: readonly PlacedItem[],
  itemId: string,
): { x: number; z: number; rotation: number } | null {
  for (let rotation = 0; rotation < 2; rotation++) {
    for (let z = 0; z < plan.depth; z++) {
      for (let x = 0; x < plan.width; x++) {
        if (checkPlacement(plan, existing, itemId, x, z, rotation).ok) {
          return { x, z, rotation };
        }
      }
    }
  }
  return null;
}

/** Hoeveel cellen er bezet zijn. */
export function occupiedCells(existing: readonly PlacedItem[]): number {
  let total = 0;
  for (const placed of existing) {
    const { w, d } = rotatedFootprint(placed.itemId, placed.rotation);
    total += w * d;
  }
  return total;
}

/**
 * Een volle kamer levert extra op. Zo is inrichten niet alleen versiering:
 * de ruimte opvullen is een doel op zich, en een grotere woning kopen betekent
 * niet automatisch meer bonus — je moet hem ook nog vullen.
 */
export const DECORATION_BONUS_CAP = 0.25;

export function decorationBonus(plan: FloorPlan, existing: readonly PlacedItem[]): number {
  const available = placeableCells(plan);
  if (available <= 0) return 0;
  const fraction = Math.min(1, occupiedCells(existing) / available);
  return Math.min(DECORATION_BONUS_CAP, fraction * 0.35);
}

// ---------------------------------------------------------------------------
// Wereldcoördinaten (voor de 3D-weergave)
// ---------------------------------------------------------------------------

/** Het midden van een cel, met de kamer gecentreerd rond de oorsprong. */
export function homeCellToWorld(
  plan: FloorPlan,
  x: number,
  z: number,
): { x: number; z: number } {
  return {
    x: (x - plan.width / 2 + 0.5) * HOME_CELL_SIZE,
    z: (z - plan.depth / 2 + 0.5) * HOME_CELL_SIZE,
  };
}

/** De cel waarin een punt op de vloer valt; null als het buiten de kamer is. */
export function worldToHomeCell(
  plan: FloorPlan,
  worldX: number,
  worldZ: number,
): { x: number; z: number } | null {
  const x = Math.floor(worldX / HOME_CELL_SIZE + plan.width / 2);
  const z = Math.floor(worldZ / HOME_CELL_SIZE + plan.depth / 2);
  if (x < 0 || z < 0 || x >= plan.width || z >= plan.depth) return null;
  return { x, z };
}

/** Middelpunt van een voorwerp, zodat een 2x1 kast netjes tussen zijn cellen staat. */
export function placedItemCenter(
  plan: FloorPlan,
  placed: PlacedItem,
): { x: number; z: number; width: number; depth: number } {
  const { w, d } = rotatedFootprint(placed.itemId, placed.rotation);
  const first = homeCellToWorld(plan, placed.x, placed.z);
  return {
    x: first.x + ((w - 1) * HOME_CELL_SIZE) / 2,
    z: first.z + ((d - 1) * HOME_CELL_SIZE) / 2,
    width: w * HOME_CELL_SIZE,
    depth: d * HOME_CELL_SIZE,
  };
}

/**
 * Waar je kunt staan in je woning.
 *
 * Dezelfde vorm als `isWalkable` voor de stad: een punt met een straal eromheen,
 * dat vrij moet zijn van muren en van wat er al staat. Hij hoort hier en niet in
 * de app, zodat de server hem later kan narekenen — precies zoals dat bij de
 * stad gebeurt.
 */
export function isHomeWalkable(
  plan: FloorPlan,
  placements: readonly PlacedItem[],
  worldX: number,
  worldZ: number,
  radius = 0.32,
): boolean {
  const halfWidth = (plan.width * HOME_CELL_SIZE) / 2;
  const halfDepth = (plan.depth * HOME_CELL_SIZE) / 2;
  // De muren staan op de rand van het raster.
  if (Math.abs(worldX) + radius > halfWidth) return false;
  if (Math.abs(worldZ) + radius > halfDepth) return false;

  for (const placed of placements) {
    const box = placedItemCenter(plan, placed);
    // Meubels vullen hun cellen niet helemaal; er blijft een randje langs
    // waar je nog net langs kunt schuiven. Zonder die marge sta je in een
    // volle kamer voortdurend klem.
    const reachX = box.width * 0.42 + radius;
    const reachZ = box.depth * 0.42 + radius;
    if (Math.abs(worldX - box.x) < reachX && Math.abs(worldZ - box.z) < reachZ) return false;
  }
  return true;
}

/**
 * Schuift een gewenste stap zo dat je niet door een muur of een kast loopt.
 * Eerst de hele stap, dan alleen x, dan alleen z — zo glijd je langs een bank
 * in plaats van ertegenaan te blijven staan.
 */
export function resolveHomeMovement(
  plan: FloorPlan,
  placements: readonly PlacedItem[],
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  radius = 0.32,
): { x: number; z: number } {
  if (isHomeWalkable(plan, placements, toX, toZ, radius)) return { x: toX, z: toZ };
  if (isHomeWalkable(plan, placements, toX, fromZ, radius)) return { x: toX, z: fromZ };
  if (isHomeWalkable(plan, placements, fromX, toZ, radius)) return { x: fromX, z: toZ };
  return { x: fromX, z: fromZ };
}

/**
 * Waar je staat als je binnenkomt: midden op de deurcel.
 *
 * Die cel blijft altijd vrij — `checkPlacement` weigert er iets neer te zetten —
 * dus dit is de enige plek waarvan zeker is dat je er kunt staan, hoe vol je
 * woning ook is.
 */
export function homeEntrance(plan: FloorPlan): { x: number; z: number } {
  const door = doorCell(plan);
  return homeCellToWorld(plan, door.x, door.z);
}

/** Elke woning moet een plattegrond hebben; anders is de winkel kapot. */
export const ALL_PROPERTIES_HAVE_PLANS = PROPERTIES.every((p) => Boolean(FLOOR_PLANS[p.id]));

/**
 * Hoogte van een meubel in meters. Zeldzamer is imposanter, met een beetje
 * variatie die uit het id volgt — zo staat hetzelfde item overal even hoog,
 * ook op de server.
 */
export function itemHeight(itemId: string): number {
  const item = getItem(itemId);
  const base =
    item.rarity === 'common'
      ? 0.5
      : item.rarity === 'uncommon'
        ? 0.7
        : item.rarity === 'rare'
          ? 0.9
          : item.rarity === 'epic'
            ? 1.1
            : 1.35;
  let hash = 0;
  for (let i = 0; i < itemId.length; i++) hash = (hash * 31 + itemId.charCodeAt(i)) >>> 0;
  return Math.round((base + (hash % 40) / 100) * 100) / 100;
}
