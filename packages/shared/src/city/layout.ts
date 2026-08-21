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
  gridSize: 160,
  /**
   * Welke cel op de wereldoorsprong ligt.
   *
   * Dit stond overal als `gridSize / 2`, en dat werkte zolang de stad precies
   * om de oorsprong heen lag. Zodra het raster groeit klopt dat niet meer: dan
   * verschuift de oorsprong mee en ligt elke opgeslagen spelerpositie en elke
   * spawn in de database ineens in een andere cel.
   *
   * Door dit vast te zetten op 64 groeit de wereld naar het oosten en het
   * zuiden zonder dat er één bestaande coördinaat verandert.
   */
  originCell: 64,
  /**
   * Cellen tussen twee wegen; cel 0 van elk blok is de weg.
   *
   * Vijf cellen betekent een straat om de veertig meter en bouwblokken van
   * tweeendertig meter breed: twee percelen diep. Daar past precies een
   * gesloten gevelwand omheen met een binnentuin in het midden. Was dit groter
   * (acht cellen, zoals eerst), dan bleef er middenin een leeg plein van
   * dertig bij dertig meter over — en dat is precies wat een stad niet is.
   */
  blockSize: 5,
  /** Cellen per chunk; chunks worden per stuk in/uit de scene geladen. */
  chunkSize: 16,
  /** Hoogte van één verdieping in meters. */
  floorHeight: 3.2,
} as const;

/** Totale breedte van de stad in meters. */
export const CITY_SPAN = CITY.gridSize * CITY.cellSize;

/**
 * De randen van de wereld in meters.
 *
 * Sinds de oorsprong vastligt op cel 64 en het raster naar het oosten en zuiden
 * doorloopt, ligt de stad niet meer netjes om nul heen. Wie hem wil afklemmen —
 * de vliegmodus bijvoorbeeld — moet dus deze grenzen gebruiken en niet de halve
 * breedte, want die klopte alleen toevallig.
 */
export const CITY_BOUNDS = {
  minX: -CITY.originCell * CITY.cellSize,
  minZ: -CITY.originCell * CITY.cellSize,
  maxX: (CITY.gridSize - CITY.originCell) * CITY.cellSize,
  maxZ: (CITY.gridSize - CITY.originCell) * CITY.cellSize,
} as const;
export const CHUNKS_PER_AXIS = CITY.gridSize / CITY.chunkSize; // 10

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
  /** Tweede vleugel bij een hoekpand; samen vormen ze een L. */
  wing?: BuildingWing;
  district: DistrictId;
}

export type BuildingStyle = 'house' | 'block' | 'tower';

/**
 * De tweede vleugel van een hoekpand.
 *
 * Een pand op een hoek ligt aan twee straten en moet aan allebei zijn gevel
 * doorzetten tot de buren. Dat kan niet met één rechthoek — vandaar een L van
 * twee vleugels, precies zoals een echt bouwblok op een hoek dichtloopt.
 */
export interface BuildingWing {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
}

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
  const half = CITY.originCell;
  return {
    x: (cx - half) * CITY.cellSize + CITY.cellSize / 2,
    z: (cz - half) * CITY.cellSize + CITY.cellSize / 2,
  };
}

/** De cel waarin een wereldpositie valt. */
export function worldToCell(x: number, z: number): { cx: number; cz: number } {
  const half = CITY.originCell;
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

/**
 * De oude oostrand van de stad: hier houdt het stratenraster op en begint de
 * zee met Het Verlaten Park erin.
 *
 * Dit getal stond op drie plekken ingetypt. Precies zo'n losse grens ging deze
 * ronde al een keer mis — de landtong viel buiten de parkcontrole en liep vol
 * ruïnes — dus krijgt hij één naam waar alles naar wijst.
 */
export const CITY_EAST_EDGE = 128;

/** Wegen liggen op elke veelvoud van blockSize, in beide richtingen. */
export function isRoadCell(cx: number, cz: number): boolean {
  // In het park liggen geen straten. Een park met stoepranden en een
  // stratenraster is geen park.
  if (cx >= CITY_EAST_EDGE) return false;
  return cx % CITY.blockSize === 0 || cz % CITY.blockSize === 0;
}

/** Doorgaande wegen — puur visueel (bredere belijning). */
export function isMainRoadCell(cx: number, cz: number): boolean {
  return cx % 32 === 0 || cz % 32 === 0;
}

/** De grenzen van Het Verlaten Park, in cellen. */
export const PARK_BOUNDS = { x0: 132, z0: 32, x1: 160, z1: 96 } as const;
/**
 * De landtong die het park met de stad verbindt.
 *
 * Bewust een strook land en geen brug: een brug vraagt een dek om overheen te
 * lopen, en dat is geometrie die er nog niet is. Een landtong is dezelfde
 * poort — één doorgang, de rest water — zonder dat er iets bij moet.
 */
export const PARK_CAUSEWAY = { x0: CITY_EAST_EDGE, z0: 60, x1: 132, z1: 64 } as const;

/** Ligt deze cel binnen het park zelf (dus niet op de landtong)? */
export function isParkCell(cx: number, cz: number): boolean {
  return (
    cx >= PARK_BOUNDS.x0 && cx < PARK_BOUNDS.x1 && cz >= PARK_BOUNDS.z0 && cz < PARK_BOUNDS.z1
  );
}

/** Het park plus de landtong ernaartoe: alles wat aan de overkant begaanbaar is. */
export function isParkSide(cx: number, cz: number): boolean {
  if (isParkCell(cx, cz)) return true;
  return (
    cx >= PARK_CAUSEWAY.x0 &&
    cx < PARK_CAUSEWAY.x1 &&
    cz >= PARK_CAUSEWAY.z0 &&
    cz < PARK_CAUSEWAY.z1
  );
}

export function isWaterCell(cx: number, cz: number): boolean {
  // Alles ten oosten van de oude stadsrand is zee, behalve het park en de
  // landtong ernaartoe. Zo is de toegang afgedwongen door de kaart zelf: water
  // is al niet begaanbaar, dus er hoeft geen hek gehandhaafd te worden.
  if (cx >= CITY_EAST_EDGE) return !isParkSide(cx, cz);

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

  const anchorX = cx - ((lx - 1) % 2);
  const anchorZ = cz - ((lz - 1) % 2);

  const size = lotSize(anchorX, anchorZ);
  for (let dz = 0; dz < size.cellsZ; dz++) {
    for (let dx = 0; dx < size.cellsX; dx++) {
      if (isWaterCell(anchorX + dx, anchorZ + dz)) return null;
    }
  }
  return { anchorX, anchorZ };
}

/**
 * Hoeveel cellen dit perceel beslaat: twee, of minder als het blok op is.
 *
 * Bij een blok van vijf cellen zijn dat twee percelen van twee cellen naast
 * elkaar. Blijft er één cel over (bij een grotere bloklengte), dan wordt dat
 * een smal perceel tegen de volgende straat aan — zonder die rij zou een
 * straat maar aan één kant bebouwd zijn.
 */
export function lotSize(anchorX: number, anchorZ: number): { cellsX: number; cellsZ: number } {
  const room = (anchor: number): number =>
    Math.max(1, Math.min(2, CITY.blockSize - (anchor % CITY.blockSize)));
  return { cellsX: room(anchorX), cellsZ: room(anchorZ) };
}

/** Middelpunt van een perceel in wereldcoordinaten. */
export function lotCenter(anchorX: number, anchorZ: number): { x: number; z: number } {
  const half = CITY.originCell;
  const size = lotSize(anchorX, anchorZ);
  return {
    x: (anchorX - half) * CITY.cellSize + (size.cellsX * CITY.cellSize) / 2,
    z: (anchorZ - half) * CITY.cellSize + (size.cellsZ * CITY.cellSize) / 2,
  };
}

/**
 * Hoe een perceel aan de straat ligt.
 *
 * Binnen een bouwblok ligt de weg aan de west- en de noordkant; de andere twee
 * zijden grenzen aan de steeg. Percelen aan een straat vormen samen de
 * gevelwand van dat blok — dat is wat een stad een stad maakt in plaats van een
 * verzameling losse dozen.
 */
export interface LotFrontage {
  west: boolean;
  east: boolean;
  north: boolean;
  south: boolean;
  /** Ligt dit perceel aan minstens één straat? */
  street: boolean;
  /** Ligt het op een hoek, dus aan twee straten? */
  corner: boolean;
}

/**
 * Aan welke straten dit perceel ligt.
 *
 * Een perceel ligt aan de westkant van een blok als het meteen achter de weg
 * begint, en aan de oostkant als zijn achtergrens tegen de volgende weg aan
 * ligt. Die tweede voorwaarde moet met de breedte van het perceel gerekend
 * worden en niet met het anker: percelen zijn niet allemaal even breed.
 */
export function lotFrontage(anchorX: number, anchorZ: number): LotFrontage {
  const size = lotSize(anchorX, anchorZ);
  const lx = anchorX % CITY.blockSize;
  const lz = anchorZ % CITY.blockSize;
  const west = lx === 1;
  const east = lx + size.cellsX === CITY.blockSize;
  const north = lz === 1;
  const south = lz + size.cellsZ === CITY.blockSize;
  return {
    west,
    east,
    north,
    south,
    street: west || east || north || south,
    corner: (west || east) && (north || south),
  };
}

/** Hoe ver de gevel van de perceelgrens af staat: de breedte van de stoep. */
const BUILDING_LINE_SETBACK = 0.6;
/**
 * Buren raken elkaar met een minieme overlap. Precies tegen elkaar aan geeft
 * twee vlakken op exact dezelfde plek, en dat kan gaan flikkeren.
 */
const PARTY_WALL_OVERLAP = 0.04;
/** Hoeveel er achter een vleugel vrij blijft; dat wordt de binnentuin. */
const COURTYARD_MIN = 4.5;
/** Vanaf zoveel verdiepingen wordt het geen rijtje meer maar een toren. */
const TOWER_FLOORS = 9;

/**
 * De diepte van een vleugel: ver genoeg voor een woning, maar nooit zo diep
 * dat de binnentuin verdwijnt.
 */
function wingDepth(span: number, scale: number): number {
  return Math.max(6.5, Math.min(span - COURTYARD_MIN, span * scale));
}

export function buildingAtCell(cx: number, cz: number): BuildingLot | null {
  const anchor = lotAnchor(cx, cz);
  if (!anchor) return null;
  const { anchorX, anchorZ } = anchor;

  const district = districtAt(anchorX, anchorZ);
  const frontage = lotFrontage(anchorX, anchorZ);

  // In het park staan alleen losse ruïnes.
  //
  // De opslag voor "aan de straat" hoort bij een gevelwand en heeft daar niets
  // te zoeken: met die opslag kwam de dichtheid op dertig procent uit en
  // stonden er aaneengesloten rijen dwars door het park, tot aan de landtong
  // toe. Er is daar ook geen straat om aan te liggen.
  if (isParkSide(anchorX, anchorZ)) {
    // De landtong blijft helemaal vrij, en rond de ingang ook. Een park waar je
    // niet in kunt is geen park — en dat was precies wat er gebeurde: de
    // straatopslag zette een muur van ruïnes dwars over de enige doorgang.
    const onCauseway = !isParkCell(anchorX, anchorZ);
    const nearEntrance =
      anchorX < PARK_BOUNDS.x0 + 6 &&
      anchorZ >= PARK_CAUSEWAY.z0 - 6 &&
      anchorZ < PARK_CAUSEWAY.z1 + 6;
    if (onCauseway || nearEntrance) return null;
    if (valueAt(CITY.seed, anchorX, anchorZ) >= district.density) return null;
  } else {
    // Aan de straat staat bijna altijd iets, anders valt de gevelwand uit elkaar.
    // Achter op het blok juist zelden: daar horen tuinen en binnenterreinen.
    const density = frontage.street
      ? Math.min(0.95, district.density + 0.22)
      : district.density * 0.4;
    if (valueAt(CITY.seed, anchorX, anchorZ) >= density) return null;
  }

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
  // Hoekpanden zijn van oudsher wat groter; achter op het blok staan alleen
  // lage bijgebouwen.
  if (frontage.west && frontage.north) floors += 1;
  if (!frontage.street) floors = Math.min(floors, 2);

  const paletteIndex = randInt(
    valueAt(CITY.seed + 3, anchorX, anchorZ),
    0,
    district.palette.length - 1,
  );
  const size = lotSize(anchorX, anchorZ);
  const spanX = size.cellsX * CITY.cellSize;
  const spanZ = size.cellsZ * CITY.cellSize;
  const center = lotCenter(anchorX, anchorZ);
  const depthScale = 0.55 + valueAt(CITY.seed + 2, anchorX, anchorZ) * 0.22;

  /** Waar de gevel komt te staan langs één as. */
  const line = (span: number, middle: number, wing: number, low: boolean): number =>
    low
      ? middle - span / 2 + BUILDING_LINE_SETBACK + wing / 2
      : middle + span / 2 - BUILDING_LINE_SETBACK - wing / 2;

  let width: number;
  let depth: number;
  let centerX: number;
  let centerZ: number;
  let wing: BuildingWing | undefined;

  if (!frontage.street) {
    // Achteraf op het blok: een vrijstaand bijgebouw in de tuin.
    width = spanX * 0.48;
    depth = spanZ * 0.48;
    centerX = center.x + (valueAt(CITY.seed + 8, anchorX, anchorZ) - 0.5) * 2.2;
    centerZ = center.z + (valueAt(CITY.seed + 9, anchorX, anchorZ) - 0.5) * 2.2;
  } else if (floors >= TOWER_FLOORS) {
    // Een toren vult het hele perceel tot aan de rooilijn. Een L-vorm van
    // twintig verdiepingen is geen gebouw meer maar een muur.
    width = spanX - BUILDING_LINE_SETBACK;
    depth = spanZ - BUILDING_LINE_SETBACK;
    centerX = frontage.west
      ? center.x + BUILDING_LINE_SETBACK / 2
      : center.x - BUILDING_LINE_SETBACK / 2;
    centerZ = frontage.north
      ? center.z + BUILDING_LINE_SETBACK / 2
      : center.z - BUILDING_LINE_SETBACK / 2;
  } else {
    // Rijtjes: elke vleugel staat met zijn gevel aan de straat en vult het
    // perceel van buur tot buur. Een hoekpand krijgt er twee, samen een L —
    // zo sluit het blok rondom en blijft er middenin een binnentuin over.
    const alongX = frontage.north || frontage.south;
    const alongZ = frontage.west || frontage.east;
    const depthZ = wingDepth(spanZ, depthScale);
    const depthX = wingDepth(spanX, 0.55 + valueAt(CITY.seed + 7, anchorX, anchorZ) * 0.22);

    if (alongX) {
      width = spanX + PARTY_WALL_OVERLAP;
      centerX = center.x;
      depth = depthZ;
      centerZ = line(spanZ, center.z, depthZ, frontage.north);
      if (alongZ) {
        wing = {
          width: depthX,
          depth: spanZ + PARTY_WALL_OVERLAP,
          centerX: line(spanX, center.x, depthX, frontage.west),
          centerZ: center.z,
        };
      }
    } else {
      width = depthX;
      centerX = line(spanX, center.x, depthX, frontage.west);
      depth = spanZ + PARTY_WALL_OVERLAP;
      centerZ = center.z;
    }
  }

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
    centerX,
    centerZ,
    width,
    depth,
    height: floors * CITY.floorHeight,
    floors,
    color,
    roofColor: darken(color, 0.45),
    style,
    setback,
    seed,
    wing,
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

/** Staat een cirkel met straal `radius` binnen deze rechthoek? */
function blocks(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
  radius: number,
): boolean {
  return Math.abs(x - centerX) < width / 2 + radius && Math.abs(z - centerZ) < depth / 2 + radius;
}

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
      // Een hoekpand is een L; beide vleugels zijn muur.
      if (blocks(x, z, lot.centerX, lot.centerZ, lot.width, lot.depth, radius)) return false;
      if (
        lot.wing &&
        blocks(x, z, lot.wing.centerX, lot.wing.centerZ, lot.wing.width, lot.wing.depth, radius)
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
  const chunkSpan = CITY.chunkSize * CITY.cellSize;
  const startWorldX = (startX - CITY.originCell) * CITY.cellSize;
  const startWorldZ = (startZ - CITY.originCell) * CITY.cellSize;
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
      // In het park is groen de regel in plaats van de uitzondering: de grond
      // is daar toch al gras, dus deze percelen dienen vooral als plek waar
      // `treesOnLot` bomen neerzet. Driekwart geeft een bos met open plekken;
      // alles vol zou een muur van bomen zijn.
      const share = isParkCell(cx, cz) ? 0.75 : GREEN_SHARE;
      if (seed < share) {
        const { x, z } = lotCenter(anchor.anchorX, anchor.anchorZ);
        const span = lotSize(anchor.anchorX, anchor.anchorZ);
        green.push({
          x,
          z,
          size: Math.min(span.cellsX, span.cellsZ) * CITY.cellSize * 0.92,
          seed,
        });
      }
    }
  }

  // Binnentuinen: het hart van elk bouwblok. De vleugels laten daar bewust
  // ruimte over, en zonder groen zou dat een verhard achtererf blijven — precies
  // het lege plein waar we vanaf wilden.
  // Let op: een blok begint met een wegcel. Het bebouwde deel — en dus ook
  // het hart van de binnentuin — ligt een cel verderop.
  const blockInterior = (CITY.blockSize - 1) * CITY.cellSize;
  const firstBlock = Math.floor(startX / CITY.blockSize);
  const lastBlock = Math.floor((startX + CITY.chunkSize - 1) / CITY.blockSize);
  const firstBlockZ = Math.floor(startZ / CITY.blockSize);
  const lastBlockZ = Math.floor((startZ + CITY.chunkSize - 1) / CITY.blockSize);
  const gridHalf = CITY.originCell;

  for (let bz = firstBlockZ; bz <= lastBlockZ; bz++) {
    for (let bx = firstBlock; bx <= lastBlock; bx++) {
      const originX = (bx * CITY.blockSize - gridHalf) * CITY.cellSize;
      const originZ = (bz * CITY.blockSize - gridHalf) * CITY.cellSize;
      const centerX = originX + CITY.cellSize + blockInterior / 2;
      const centerZ = originZ + CITY.cellSize + blockInterior / 2;
      // Alleen tekenen bij het blok dat er het meest van in deze chunk ligt,
      // anders staat dezelfde tuin er straks twee keer.
      if (
        centerX < startWorldX ||
        centerX >= startWorldX + chunkSpan ||
        centerZ < startWorldZ ||
        centerZ >= startWorldZ + chunkSpan
      ) {
        continue;
      }
      const seed = valueAt(CITY.seed + 14, bx, bz);
      const size = 6.5 + seed * 3.0;
      const reach = size / 2;
      // Staat er een toren op het blok, dan is er geen binnentuin meer over.
      const open =
        isWalkable(centerX - reach, centerZ - reach, 0.3) &&
        isWalkable(centerX + reach, centerZ - reach, 0.3) &&
        isWalkable(centerX - reach, centerZ + reach, 0.3) &&
        isWalkable(centerX + reach, centerZ + reach, 0.3);
      if (open) green.push({ x: centerX, z: centerZ, size, seed });
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

  const half = CITY.originCell;
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
