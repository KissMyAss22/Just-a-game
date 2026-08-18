import type { Rarity } from '../types';

export type DistrictId =
  | 'oldTown'
  | 'downtown'
  | 'docks'
  | 'industrial'
  | 'suburbs'
  | 'marina'
  | 'nightlife'
  | 'airport'
  | 'hills'
  | 'island';

/** Rechthoek in celcoördinaten: [x0, z0, x1, z1), x1/z1 exclusief. */
export type CellRect = readonly [number, number, number, number];

export interface DistrictDef {
  id: DistrictId;
  name: string;
  /** Korte sfeeromschrijving voor het kaartscherm. */
  tagline: string;
  bounds: CellRect;
  /** Vanaf welk spelerlevel je hier mag komen. */
  unlockLevel: number;
  /** Kleurenpalet voor de gegenereerde gebouwen. */
  palette: readonly string[];
  /** Kleur van het wegdek/de grond. */
  groundColor: string;
  /** Min/max gebouwhoogte in verdiepingen. */
  floors: readonly [number, number];
  /** Kans dat een niet-weg-cel bebouwd is (rest wordt park/plein). */
  density: number;
  /** Relatieve kans dat hier een item spawnt t.o.v. andere districten. */
  spawnWeight: number;
  /** Hoeveel seconden een spawn blijft liggen voordat hij verdwijnt. */
  spawnTtlSeconds: number;
  /** Kansverdeling over zeldzaamheden bij een spawn in dit district. */
  rarityWeights: Readonly<Record<Rarity, number>>;
}

/**
 * De stad is 128x128 cellen. Deze rechthoeken dekken samen het hele grid,
 * zodat elke cel precies één district heeft.
 */
export const DISTRICTS: readonly DistrictDef[] = [
  {
    id: 'airport',
    name: 'Vliegveld',
    tagline: 'Hangars, tarmac en vracht die niemand mist',
    bounds: [0, 0, 40, 34],
    unlockLevel: 40,
    palette: ['#94a3b8', '#cbd5e1', '#64748b', '#e2e8f0'],
    groundColor: '#3f4756',
    floors: [1, 3],
    density: 0.45,
    spawnWeight: 0.7,
    spawnTtlSeconds: 900,
    rarityWeights: { common: 18, uncommon: 26, rare: 28, epic: 18, legendary: 8, mythic: 2 },
  },
  {
    id: 'downtown',
    name: 'Centrum',
    tagline: 'Glas, neon en te veel geld op één vierkante kilometer',
    bounds: [40, 0, 88, 46],
    unlockLevel: 5,
    palette: ['#1e293b', '#334155', '#0f172a', '#475569', '#1e3a5f'],
    groundColor: '#2a2f3a',
    floors: [6, 26],
    density: 0.82,
    spawnWeight: 1.6,
    spawnTtlSeconds: 480,
    rarityWeights: { common: 40, uncommon: 33, rare: 18, epic: 7, legendary: 1.8, mythic: 0.2 },
  },
  {
    id: 'hills',
    name: 'De Heuvels',
    tagline: 'Villa’s met uitzicht en hekken met camera’s',
    bounds: [88, 0, 128, 44],
    unlockLevel: 50,
    palette: ['#f1f5f9', '#e7e5e4', '#d6d3d1', '#fef3c7'],
    groundColor: '#4a5240',
    floors: [2, 4],
    density: 0.32,
    spawnWeight: 0.5,
    spawnTtlSeconds: 1200,
    rarityWeights: { common: 8, uncommon: 16, rare: 26, epic: 30, legendary: 16, mythic: 4 },
  },
  {
    id: 'nightlife',
    name: 'De Strip',
    tagline: 'Clubs, neon en losse briefjes op de stoep',
    bounds: [0, 34, 40, 62],
    unlockLevel: 30,
    palette: ['#4c1d95', '#831843', '#1e1b4b', '#701a75'],
    groundColor: '#241b2e',
    floors: [2, 8],
    density: 0.7,
    spawnWeight: 1.3,
    spawnTtlSeconds: 420,
    rarityWeights: { common: 26, uncommon: 30, rare: 24, epic: 14, legendary: 5, mythic: 1 },
  },
  {
    id: 'oldTown',
    name: 'Oude Stad',
    tagline: 'Waar je begint: smalle straten en veel rommel',
    bounds: [40, 46, 88, 84],
    unlockLevel: 1,
    palette: ['#a16207', '#b45309', '#92400e', '#c2410c', '#78350f'],
    groundColor: '#3d3630',
    floors: [2, 5],
    density: 0.68,
    spawnWeight: 2,
    spawnTtlSeconds: 360,
    rarityWeights: { common: 62, uncommon: 27, rare: 9, epic: 1.8, legendary: 0.2, mythic: 0 },
  },
  {
    id: 'suburbs',
    name: 'Buitenwijk',
    tagline: 'Rijtjeshuizen, garages en verrassend goed meubilair',
    bounds: [88, 44, 128, 92],
    unlockLevel: 18,
    palette: ['#bfdbfe', '#fde68a', '#fecaca', '#d9f99d', '#e9d5ff'],
    groundColor: '#414a3c',
    floors: [1, 3],
    density: 0.5,
    spawnWeight: 1.1,
    spawnTtlSeconds: 600,
    rarityWeights: { common: 34, uncommon: 34, rare: 22, epic: 8, legendary: 2, mythic: 0 },
  },
  {
    id: 'industrial',
    name: 'Industrieterrein',
    tagline: 'Fabriekshallen, schroot en alles wat je kunt smelten',
    bounds: [0, 62, 40, 96],
    unlockLevel: 15,
    palette: ['#57534e', '#78716c', '#44403c', '#7f1d1d'],
    groundColor: '#33322e',
    floors: [1, 4],
    density: 0.6,
    spawnWeight: 1.2,
    spawnTtlSeconds: 540,
    rarityWeights: { common: 40, uncommon: 32, rare: 20, epic: 7, legendary: 1, mythic: 0 },
  },
  {
    id: 'docks',
    name: 'De Haven',
    tagline: 'Containers, kranen en ladingen zonder eigenaar',
    bounds: [40, 84, 88, 128],
    unlockLevel: 10,
    palette: ['#0e7490', '#b91c1c', '#1d4ed8', '#15803d', '#a16207'],
    groundColor: '#2f3538',
    floors: [1, 5],
    density: 0.55,
    spawnWeight: 1.4,
    spawnTtlSeconds: 600,
    rarityWeights: { common: 38, uncommon: 32, rare: 21, epic: 7.5, legendary: 1.5, mythic: 0 },
  },
  {
    id: 'marina',
    name: 'Jachthaven',
    tagline: 'Boten, terrassen en mensen die nooit lijken te werken',
    bounds: [88, 92, 128, 128],
    unlockLevel: 25,
    palette: ['#f8fafc', '#e0f2fe', '#fef9c3', '#ccfbf1'],
    groundColor: '#3a4448',
    floors: [1, 4],
    density: 0.34,
    spawnWeight: 0.9,
    spawnTtlSeconds: 900,
    rarityWeights: { common: 14, uncommon: 24, rare: 30, epic: 22, legendary: 9, mythic: 1 },
  },
  {
    id: 'island',
    name: 'Privé-eiland',
    tagline: 'Alleen bereikbaar met een boot die je nog niet hebt',
    bounds: [0, 96, 40, 128],
    unlockLevel: 60,
    palette: ['#fef3c7', '#fed7aa', '#fecdd3'],
    groundColor: '#5a6b3f',
    floors: [1, 3],
    density: 0.22,
    spawnWeight: 0.35,
    spawnTtlSeconds: 1800,
    rarityWeights: { common: 2, uncommon: 8, rare: 18, epic: 30, legendary: 30, mythic: 12 },
  },
] as const;

export const DISTRICTS_BY_ID: Readonly<Record<DistrictId, DistrictDef>> =
  Object.fromEntries(DISTRICTS.map((d) => [d.id, d])) as Record<DistrictId, DistrictDef>;

export function getDistrict(id: DistrictId): DistrictDef {
  const d = DISTRICTS_BY_ID[id];
  if (!d) throw new Error(`Onbekend district: ${id}`);
  return d;
}
