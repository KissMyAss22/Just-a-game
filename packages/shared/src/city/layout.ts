import { randInt, valueAt } from '../rng';
import {
  DISTRICTS,
  DISTRICTS_BY_ID,
  FACADE_CODE,
  type DistrictDef,
  type DistrictId,
  type FacadeStyle,
} from './districts';

/**
 * De stad is *data*, geen 3D-model.
 *
 * Client en server rekenen met exact deze functies, dus ze zijn het altijd
 * eens over waar een straat ligt, waar een gebouw staat en of een speler op
 * een geldige plek staat. Alles is deterministisch afgeleid van CITY.seed —
 * er wordt nergens Math.random() gebruikt.
 */
export const CITY = {
  seed: 20260818,
  /** Meters per cel. */
  cellSize: 8,
  /** Aantal cellen in x- en z-richting. */
  gridSize: 128,
  /** Cellen tussen twee wegen (cel 0 van elk blok is de weg). */
  blockSize: 8,
  /** Cellen per chunk; chunks worden per stuk in/uit de scene geladen. */
  chunkSize: 16,
  /** Hoogte van één verdieping in meters. */
  floorHeight: 3.2,
} as const;

/** Totale breedte van de stad in meters. */
export const CITY_SPAN = CITY.gridSize * CITY.cellSize; // 1024 m
export const CHUNKS_PER_AXIS = CITY.gridSize / CITY.chunkSize; // 8

/** De speler start op deze kruising in de Oude Stad. */
export const SPAWN_CELL = { x: 64, z: 64 } as const;

export type CellType = 'road' | 'building' | 'park' | 'water';

/** Welk deel van de onbebouwde percelen groen wordt in plaats van bestrating. */
const GREEN_SHARE = 0.42;

export interface BuildingLot {
  /** Ankercel linksboven van het perceel. */
  anchorX: number;
  anchorZ: number;
  /** Wereldcoördinaten van het middelpunt. */
  centerX: number;
  centerZ: number;
  /** Breedte/diepte in meters. */
  width: number;
  depth: number;
  /** Hoogte in meters. */
  height: number;
  floors: number;
  color: string;
  /** Iets donkerder dan de gevel; voor het dak en de dakrand. */
  roofColor: string;
  /** Bepaalt de vorm: een huis, een blok of een toren met terugsprong. */
  style: BuildingStyle;
  /**
   * Op welke hoogtefractie de toren smaller wordt (0 = geen terugsprong).
   * Alleen hoge panden krijgen dit; het breekt de skyline van het Centrum.
   */
  setback: number;
  /** 0..1, stabiel per perceel. De gevelshader varieert hierop. */
  seed: number;
  /** Gevelsoort van dit pand, overgenomen van het district. */
  facade: FacadeStyle;
  /** Dezelfde gevelsoort als getal, zoals de shader hem verwacht. */
  facadeCode: number;
  /** Aantal dakopbouwen (liftschacht, installaties) op het dak. */
  roofUnits: number;
  district: DistrictId;
}

export type BuildingStyle = 'house' | 'block' | 'tower';

/** Maakt een hexkleur donkerder (amount 0..1). Voor daken en dakranden. */
export function darken(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return hex;
  const f = Math.max(0, 1 - amount);
  const r = Math.round(((num >> 16) & 255) * f);
  const g = Math.round(((num >> 8) & 255) * f);
  const b = Math.round((num & 255) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// Coördinaten
// ---------------------------------------------------------------------------

/** Middelpunt van een cel in wereldcoördinaten (meters). */
export function cellToWorld(cx: number, cz: number): { x: number; z: number } {
  const half = CITY.gridSize / 2;
  return {
    x: (cx - half) * CITY.cellSize + CITY.cellSize / 2,
    z: (cz - half) * CITY.cellSize + CITY.cellSize / 2,
  };
}

/** De cel waarin een wereldpositie valt. */
export function worldToCell(x: number, z: number): { cx: number; cz: number } {
  const half = CITY.gridSize / 2;
  return {
    cx: Math.floor(x / CITY.cellSize) + half,
    cz: Math.floor(z / CITY.cellSize) + half,
  };
}

export function isInsideCity(cx: number, cz: number): boolean {
  return cx >= 0 && cz >= 0 && cx < CITY.gridSize && cz < CITY.gridSize;
}

// ---------------------------------------------------------------------------
// Districten
// ---------------------------------------------------------------------------

export function districtAt(cx: number, cz: number): DistrictDef {
  for (const d of DISTRICTS) {
    const [x0, z0, x1, z1] = d.bounds;
    if (cx >= x0 && cx < x1 && cz >= z0 && cz < z1) return d;
  }
  return DISTRICTS_BY_ID.oldTown;
}

export function districtAtWorld(x: number, z: number): DistrictDef {
  const { cx, cz } = worldToCell(x, z);
  return districtAt(cx, cz);
}

// ---------------------------------------------------------------------------
// Celtypes
// ---------------------------------------------------------------------------

/** Wegen liggen op elke veelvoud van blockSize, in beide richtingen. */
export function isRoadCell(cx: number, cz: number): boolean {
  return cx % CITY.blockSize === 0 || cz % CITY.blockSize === 0;
}

/** Doorgaande wegen — puur visueel (bredere belijning). */
export function isMainRoadCell(cx: number, cz: number): boolean {
  return cx % 32 === 0 || cz % 32 === 0;
}

export function isWaterCell(cx: number, cz: number): boolean {
  // Het privé-eiland ligt los in zee, met een ronde kustlijn.
  if (cx < 40 && cz >= 96) {
    const dx = cx - 20;
    const dz = cz - 111;
    return dx * dx + dz * dz > 12 * 12;
  }
  // Open zee aan de zuidkant.
  if (cz >= 120) return true;
  // Het bassin van de jachthaven.
  if (cx >= 96 && cx < 124 && cz >= 104 && cz < 120) return true;
  return false;
}

/**
 * Het perceel waar deze cel bij hoort, of null als hier geen gebouw staat.
 * Percelen zijn 2x2 cellen (16x16 m); de laatste cel van elk blok blijft
 * steeg/binnenplaats.
 */
export function lotAnchor(cx: number, cz: number): { anchorX: number; anchorZ: number } | null {
  if (!isInsideCity(cx, cz)) return null;

  const lx = cx % CITY.blockSize;
  const lz = cz % CITY.blockSize;
  if (lx === 0 || lz === 0) return null; // weg
  if (lx === CITY.blockSize - 1 || lz === CITY.blockSize - 1) return null; // steeg

  const anchorX = cx - ((lx - 1) % 2);
  const anchorZ = cz - ((lz - 1) % 2);

  if (
    isWaterCell(anchorX, anchorZ) ||
    isWaterCell(anchorX + 1, anchorZ) ||
    isWaterCell(anchorX, anchorZ + 1) ||
    isWaterCell(anchorX + 1, anchorZ + 1)
  ) {
    return null;
  }
  return { anchorX, anchorZ };
}

/** Middelpunt van een perceel van 2x2 cellen, in wereldcoordinaten. */
export function lotCenter(anchorX: number, anchorZ: number): { x: number; z: number } {
  const half = CITY.gridSize / 2;
  return {
    x: (anchorX - half) * CITY.cellSize + CITY.cellSize,
    z: (anchorZ - half) * CITY.cellSize + CITY.cellSize,
  };
}

export function buildingAtCell(cx: number, cz: number): BuildingLot | null {
  const anchor = lotAnchor(cx, cz);
  if (!anchor) return null;
  const { anchorX, anchorZ } = anchor;

  const district = districtAt(anchorX, anchorZ);
  if (valueAt(CITY.seed, anchorX, anchorZ) >= district.density) return null;

  let floors = randInt(
    valueAt(CITY.seed + 1, anchorX, anchorZ),
    district.floors[0],
    district.floors[1],
  );
  // Af en toe een pand dat boven de buurt uitsteekt. Zonder die uitschieters
  // wordt elke straat even hoog en leest de stad als een raster van dozen.
  if (valueAt(CITY.seed + 10, anchorX, anchorZ) > 0.94) {
    floors = Math.round(floors * 1.7) + 1;
  }
  // Breedte en diepte los van elkaar, plus een kleine verspringing binnen het
  // perceel: dat haalt de rechte rooilijn eruit zonder de stoep te raken.
  const scaleX = 0.70 + valueAt(CITY.seed + 2, anchorX, anchorZ) * 0.22;
  const scaleZ = 0.70 + valueAt(CITY.seed + 7, anchorX, anchorZ) * 0.22;
  const shiftX = (valueAt(CITY.seed + 8, anchorX, anchorZ) - 0.5) * 1.6;
  const shiftZ = (valueAt(CITY.seed + 9, anchorX, anchorZ) - 0.5) * 1.6;
  const paletteIndex = randInt(
    valueAt(CITY.seed + 3, anchorX, anchorZ),
    0,
    district.palette.length - 1,
  );
  const lotSpan = CITY.cellSize * 2;
  const center = lotCenter(anchorX, anchorZ);
  const color = district.palette[paletteIndex] ?? '#888888';
  const style: BuildingStyle = floors <= 3 ? 'house' : floors <= 8 ? 'block' : 'tower';
  const seed = valueAt(CITY.seed + 4, anchorX, anchorZ);
  // Alleen echt hoge panden springen terug; anders wordt de skyline onrustig.
  const setback = floors >= 12 ? 0.42 + valueAt(CITY.seed + 5, anchorX, anchorZ) * 0.22 : 0;

  // Alleen panden met een plat dak van enige omvang krijgen installaties.
  const roofUnits =
    floors >= 3 ? randInt(valueAt(CITY.seed + 13, anchorX, anchorZ), 1, 3) : 0;

  return {
    anchorX,
    anchorZ,
    centerX: center.x + shiftX,
    centerZ: center.z + shiftZ,
    width: lotSpan * scaleX,
    depth: lotSpan * scaleZ,
    height: floors * CITY.floorHeight,
    floors,
    color,
    roofColor: darken(color, 0.45),
    style,
    setback,
    seed,
    facade: district.facade,
    facadeCode: FACADE_CODE[district.facade],
    roofUnits,
    district: district.id,
  };
}

export function cellType(cx: number, cz: number): CellType {
  if (isWaterCell(cx, cz)) return 'water';
  if (isRoadCell(cx, cz)) return 'road';
  return buildingAtCell(cx, cz) ? 'building' : 'park';
}

// ---------------------------------------------------------------------------
// Botsingen / begaanbaarheid
// ---------------------------------------------------------------------------

/**
 * Mag de speler (een cirkel met straal `radius`) hier staan?
 * Controleert water en de rechthoeken van gebouwen in de buurt.
 */
export function isWalkable(x: number, z: number, radius = 0.45): boolean {
  const { cx, cz } = worldToCell(x, z);
  if (!isInsideCity(cx, cz)) return false;
  if (isWaterCell(cx, cz)) return false;

  const reach = Math.ceil((radius + CITY.cellSize) / CITY.cellSize);
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const lot = buildingAtCell(cx + dx, cz + dz);
      if (!lot) continue;
      const halfW = lot.width / 2 + radius;
      const halfD = lot.depth / 2 + radius;
      if (
        Math.abs(x - lot.centerX) < halfW &&
        Math.abs(z - lot.centerZ) < halfD
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Schuift een gewenste positie zo dat de speler niet in een gebouw loopt.
 * Probeert eerst de volledige beweging, dan alleen x, dan alleen z — zo glijd
 * je langs muren in plaats van vast te lopen.
 */
export function resolveMovement(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  radius = 0.45,
): { x: number; z: number } {
  if (isWalkable(toX, toZ, radius)) return { x: toX, z: toZ };
  if (isWalkable(toX, fromZ, radius)) return { x: toX, z: fromZ };
  if (isWalkable(fromX, toZ, radius)) return { x: fromX, z: toZ };
  return { x: fromX, z: fromZ };
}

// ---------------------------------------------------------------------------
// Chunks (renderen)
// ---------------------------------------------------------------------------

export interface ChunkContent {
  key: string;
  chunkX: number;
  chunkZ: number;
  /** Middelpunt van de chunk in wereldcoördinaten. */
  centerX: number;
  centerZ: number;
  size: number;
  groundColor: string;
  buildings: BuildingLot[];
  /**
   * Onbebouwde percelen die groen zijn. Vroeger werd elke lege cel groen,
   * waardoor de stad meer op een golfbaan leek dan op een stad; nu is groen
   * een uitzondering en is de rest gewoon bestrating.
   */
  green: { x: number; z: number; size: number; seed: number }[];
  water: { x: number; z: number; size: number }[];
}

export function chunkKey(chunkX: number, chunkZ: number): string {
  return `${chunkX}:${chunkZ}`;
}

export function chunkAtWorld(x: number, z: number): { chunkX: number; chunkZ: number } {
  const { cx, cz } = worldToCell(x, z);
  return {
    chunkX: Math.floor(cx / CITY.chunkSize),
    chunkZ: Math.floor(cz / CITY.chunkSize),
  };
}

/** Bouwt alles wat er in één chunk te zien is. Puur, dus goed te cachen. */
export function buildChunk(chunkX: number, chunkZ: number): ChunkContent {
  const startX = chunkX * CITY.chunkSize;
  const startZ = chunkZ * CITY.chunkSize;
  const buildings: BuildingLot[] = [];
  const green: ChunkContent['green'] = [];
  const water: ChunkContent['water'] = [];
  const seen = new Set<string>();
  const districtTally = new Map<DistrictId, number>();

  for (let dz = 0; dz < CITY.chunkSize; dz++) {
    for (let dx = 0; dx < CITY.chunkSize; dx++) {
      const cx = startX + dx;
      const cz = startZ + dz;
      const district = districtAt(cx, cz);
      districtTally.set(district.id, (districtTally.get(district.id) ?? 0) + 1);

      if (isWaterCell(cx, cz)) {
        const { x, z } = cellToWorld(cx, cz);
        water.push({ x, z, size: CITY.cellSize });
        continue;
      }
      const anchor = lotAnchor(cx, cz);
      if (!anchor) continue; // weg of steeg: die tekent de wegshader
      const key = `${anchor.anchorX}:${anchor.anchorZ}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const lot = buildingAtCell(cx, cz);
      if (lot) {
        buildings.push(lot);
        continue;
      }
      const seed = valueAt(CITY.seed + 6, anchor.anchorX, anchor.anchorZ);
      if (seed < GREEN_SHARE) {
        const { x, z } = lotCenter(anchor.anchorX, anchor.anchorZ);
        green.push({ x, z, size: CITY.cellSize * 2 * 0.92, seed });
      }
    }
  }

  let dominant: DistrictId = 'oldTown';
  let best = -1;
  for (const [id, count] of districtTally) {
    if (count > best) {
      best = count;
      dominant = id;
    }
  }

  const half = CITY.gridSize / 2;
  const span = CITY.chunkSize * CITY.cellSize;
  return {
    key: chunkKey(chunkX, chunkZ),
    chunkX,
    chunkZ,
    centerX: (startX - half) * CITY.cellSize + span / 2,
    centerZ: (startZ - half) * CITY.cellSize + span / 2,
    size: span,
    groundColor: DISTRICTS_BY_ID[dominant].groundColor,
    buildings,
    green,
    water,
  };
}

/** Alle chunks binnen `range` chunks rond een wereldpositie. */
export function chunksAround(
  x: number,
  z: number,
  range: number,
): { chunkX: number; chunkZ: number }[] {
  const { chunkX, chunkZ } = chunkAtWorld(x, z);
  const out: { chunkX: number; chunkZ: number }[] = [];
  for (let dz = -range; dz <= range; dz++) {
    for (let dx = -range; dx <= range; dx++) {
      const nx = chunkX + dx;
      const nz = chunkZ + dz;
      if (nx < 0 || nz < 0 || nx >= CHUNKS_PER_AXIS || nz >= CHUNKS_PER_AXIS) continue;
      out.push({ chunkX: nx, chunkZ: nz });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Spawnposities
// ---------------------------------------------------------------------------

/**
 * Zoekt een begaanbare plek in een district. Gebruikt rejection sampling met
 * een seeded reeks, zodat de server dezelfde plek kan herberekenen.
 */
export function findSpawnPoint(
  districtId: DistrictId,
  next: () => number,
  maxTries = 64,
): { x: number; z: number; cx: number; cz: number } | null {
  const district = DISTRICTS_BY_ID[districtId];
  const [x0, z0, x1, z1] = district.bounds;
  for (let i = 0; i < maxTries; i++) {
    const cx = x0 + Math.floor(next() * (x1 - x0));
    const cz = z0 + Math.floor(next() * (z1 - z0));
    if (isWaterCell(cx, cz)) continue;
    if (buildingAtCell(cx, cz)) continue;
    const { x, z } = cellToWorld(cx, cz);
    // Kleine variatie binnen de cel, maar wel weg van de randen.
    const jx = x + (next() - 0.5) * (CITY.cellSize * 0.5);
    const jz = z + (next() - 0.5) * (CITY.cellSize * 0.5);
    if (!isWalkable(jx, jz, 0.6)) continue;
    return { x: jx, z: jz, cx, cz };
  }
  return null;
}

/** Wereldpositie waar een nieuwe speler begint. */
export function spawnPosition(): { x: number; z: number } {
  return cellToWorld(SPAWN_CELL.x, SPAWN_CELL.z);
}
