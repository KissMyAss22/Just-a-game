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
  | 'island'
  | 'park';

/** Gevelsoort; de nummers komen één op één in de shader terecht. */
export type FacadeStyle = 'stuc' | 'metselwerk' | 'vliesgevel' | 'beton';

export const FACADE_CODE: Readonly<Record<FacadeStyle, number>> = {
  stuc: 0,
  metselwerk: 1,
  vliesgevel: 2,
  beton: 3,
};

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
  /**
   * Hoe de gevels eruitzien. De shader tekent per soort een ander patroon:
   * metselwerk heeft lagen en stootvoegen, een vliesgevel is glas van vloer
   * tot plafond, betonpanelen hebben zichtbare naden. Dit is wat een wijk
   * herkenbaar maakt zodra je hem in loopt.
   */
  facade: FacadeStyle;
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
  /**
   * Kansverdeling over zeldzaamheden bij een spawn in dit district.
   *
   * Legendarisch en mythisch blijven overal zeldzaam: van 0,2% in de Oude Stad
   * tot 8% op het eiland. Stond dit hoger, dan werd oprapen zó lucratief dat
   * het passieve inkomen — de kern van een idle game — er niet meer toe deed.
   */
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
    facade: 'beton',
    palette: ['#8d9299', '#b6bac0', '#6c7178', '#c9ccd0'],
    groundColor: '#3f4756',
    floors: [1, 3],
    density: 0.45,
    spawnWeight: 0.7,
    spawnTtlSeconds: 900,
    rarityWeights: { common: 26, uncommon: 30, rare: 26, epic: 14, legendary: 3.5, mythic: 0.5 },
  },
  {
    id: 'downtown',
    name: 'Centrum',
    tagline: 'Glas, neon en te veel geld op één vierkante kilometer',
    bounds: [40, 0, 88, 46],
    unlockLevel: 5,
    facade: 'vliesgevel',
    palette: ['#38414d', '#4a5462', '#2a323c', '#5b6675', '#33475e'],
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
    facade: 'stuc',
    palette: ['#dcdcd6', '#cfc9c1', '#bdb7ae', '#e0d6bc'],
    groundColor: '#4a5240',
    floors: [2, 4],
    density: 0.32,
    spawnWeight: 0.5,
    spawnTtlSeconds: 1200,
    rarityWeights: { common: 16, uncommon: 24, rare: 30, epic: 23, legendary: 6, mythic: 1 },
  },
  {
    id: 'nightlife',
    name: 'De Strip',
    tagline: 'Clubs, neon en losse briefjes op de stoep',
    bounds: [0, 34, 40, 62],
    unlockLevel: 30,
    facade: 'beton',
    palette: ['#3d2a52', '#5a2740', '#252340', '#4a2650'],
    groundColor: '#241b2e',
    floors: [2, 8],
    density: 0.7,
    spawnWeight: 1.3,
    spawnTtlSeconds: 420,
    rarityWeights: { common: 30, uncommon: 32, rare: 24, epic: 11, legendary: 2.5, mythic: 0.5 },
  },
  {
    id: 'oldTown',
    name: 'Oude Stad',
    tagline: 'Waar je begint: smalle straten en veel rommel',
    bounds: [40, 46, 88, 84],
    unlockLevel: 1,
    facade: 'metselwerk',
    palette: ['#9c6b4f', '#8a5a44', '#b08a63', '#7d4a3a', '#c2a583'],
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
    facade: 'metselwerk',
    palette: ['#c3cdd6', '#d8ccae', '#cfb5b0', '#c2cbb0', '#c8bcc8'],
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
    facade: 'beton',
    palette: ['#6a655f', '#837d75', '#514d48', '#7a4a44'],
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
    bounds: [40, 84, 88, 160],
    unlockLevel: 10,
    facade: 'beton',
    palette: ['#2c7186', '#9a3b34', '#3a5c93', '#3d7a52', '#96794a'],
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
    bounds: [88, 92, 128, 160],
    unlockLevel: 25,
    facade: 'stuc',
    palette: ['#e4e6e6', '#cfdde4', '#e2ddc4', '#cbdcd6'],
    groundColor: '#3a4448',
    floors: [1, 4],
    density: 0.34,
    spawnWeight: 0.9,
    spawnTtlSeconds: 900,
    rarityWeights: { common: 22, uncommon: 28, rare: 28, epic: 17, legendary: 4.5, mythic: 0.5 },
  },
  {
    id: 'island',
    name: 'Privé-eiland',
    tagline: 'Alleen bereikbaar met een boot die je nog niet hebt',
    bounds: [0, 96, 40, 160],
    unlockLevel: 60,
    facade: 'stuc',
    palette: ['#e6dcc0', '#e0c9ac', '#dcc2c0'],
    groundColor: '#5a6b3f',
    floors: [1, 3],
    density: 0.22,
    spawnWeight: 0.35,
    spawnTtlSeconds: 1800,
    rarityWeights: { common: 12, uncommon: 22, rare: 30, epic: 28, legendary: 7, mythic: 1 },
  },
  {
    id: 'park',
    name: 'Het Verlaten Park',
    tagline: 'Overwoekerd, stil, en er ligt van alles tussen het gras',
    // De hele oostelijke strook. Het grootste deel is zee; alleen het park zelf
    // en de landtong ernaartoe zijn begaanbaar — zie isWaterCell.
    bounds: [128, 0, 160, 160],
    unlockLevel: 20,
    facade: 'beton',
    palette: ['#6e6a5e', '#7c7466', '#5e5a50'],
    groundColor: '#3f5233',
    floors: [1, 2],
    // Bijna niets: een paar ruïnes om achter te schuilen, verder gras.
    density: 0.08,
    spawnWeight: 1.1,
    spawnTtlSeconds: 420,
    // Het beste profiel van het spel, maar wél binnen de grens die de
    // balanstest bewaakt: legendarisch plus mythisch samen op tien procent.
    // Die grens staat er niet voor niets — wordt oprapen te lucratief, dan doet
    // het passieve inkomen er niet meer toe, en dát is de kern van dit spel.
    //
    // De aantrekkingskracht van het park zit dan ook niet in een hogere kans,
    // maar in de items die je er als enige plek kunt vínden.
    rarityWeights: { common: 6, uncommon: 12, rare: 30, epic: 42, legendary: 8, mythic: 2 },
  },
] as const;

export const DISTRICTS_BY_ID: Readonly<Record<DistrictId, DistrictDef>> =
  Object.fromEntries(DISTRICTS.map((d) => [d.id, d])) as Record<DistrictId, DistrictDef>;

export function getDistrict(id: DistrictId): DistrictDef {
  const d = DISTRICTS_BY_ID[id];
  if (!d) throw new Error(`Onbekend district: ${id}`);
  return d;
}
