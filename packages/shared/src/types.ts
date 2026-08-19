/** Zeldzaamheid van een item — bepaalt waarde, spawnkans en kleur in de UI. */
export type Rarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'mythic';

export const RARITIES: readonly Rarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
] as const;

/**
 * Weegfactor voor ervaring per zeldzaamheid.
 *
 * Dit heette ooit RARITY_VALUE_MULTIPLIER en werd óók op de verkoopprijs
 * losgelaten. Omdat `baseValue` in de itemtabel al per tier oploopt, werd de
 * zeldzaamheid daarmee dubbel verrekend: een legendarische diamant bracht
 * 126.000 op terwijl een rijtjeshuis 55.000 kost. Eén gelukkige vondst sloeg
 * dus uren spelen over. De prijs komt nu rechtstreeks uit `baseValue`; deze
 * factor geldt alleen nog voor XP.
 */
export const RARITY_XP_WEIGHT: Readonly<Record<Rarity, number>> = {
  common: 1,
  uncommon: 3,
  rare: 9,
  epic: 27,
  legendary: 90,
  mythic: 300,
};

export const RARITY_LABEL: Readonly<Record<Rarity, string>> = {
  common: 'Gewoon',
  uncommon: 'Ongewoon',
  rare: 'Zeldzaam',
  epic: 'Episch',
  legendary: 'Legendarisch',
  mythic: 'Mythisch',
};

export const RARITY_COLOR: Readonly<Record<Rarity, string>> = {
  common: '#9ca3af',
  uncommon: '#4ade80',
  rare: '#38bdf8',
  epic: '#c084fc',
  legendary: '#fbbf24',
  mythic: '#fb7185',
};

/** Wat je met een item kunt doen. */
export type ItemCategory =
  | 'valuable' // puur verkopen
  | 'material' // craften en upgraden
  | 'part' // voertuigonderdelen
  | 'decor' // plaatsbaar in je base -> passief inkomen
  | 'cosmetic' // uiterlijk
  | 'token'; // season pass valuta

export const CATEGORY_LABEL: Readonly<Record<ItemCategory, string>> = {
  valuable: 'Waardevol',
  material: 'Materiaal',
  part: 'Onderdeel',
  decor: 'Interieur',
  cosmetic: 'Cosmetisch',
  token: 'Seizoen',
};

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  rarity: Rarity;
  /** Basisprijs bij verkoop, vóór zeldzaamheids- en marktmultiplier. */
  baseValue: number;
  /** Passief inkomen per uur als het item in je base staat (alleen decor). */
  incomePerHour?: number;
  /** Draagt bij aan je Flex Score. */
  flex?: number;
  /** Emoji-placeholder; wordt later een 3D-model of icoon. */
  icon: string;
}

/** Valuta's in het spel. */
export type Currency = 'cash' | 'gems';

/** Een beloning die uit een quest, season pass tier of level-up komt. */
export type Reward =
  | { kind: 'cash'; amount: number }
  | { kind: 'gems'; amount: number }
  | { kind: 'seasonXp'; amount: number }
  | { kind: 'item'; itemId: string; amount: number }
  | { kind: 'vehicle'; vehicleId: string }
  | { kind: 'boost'; boostId: string; hours: number };

/** Tijdelijke boost die je met gems koopt of uit de season pass krijgt. */
export interface BoostDef {
  id: string;
  name: string;
  description: string;
  /** Vermenigvuldiger op passief inkomen, bv. 0.5 = +50%. */
  incomeBonus: number;
  /** Kans op een dubbele opbrengst bij het oprapen, bv. 0.25 = 25%. */
  spawnBonus?: number;
  /** Standaardduur in uren. */
  durationHours: number;
  /** Prijs in gems. */
  priceGems: number;
  icon: string;
}

export const BOOSTS: readonly BoostDef[] = [
  {
    id: 'coffee',
    name: 'Koffie',
    description: '+25% passief inkomen',
    incomeBonus: 0.25,
    durationHours: 2,
    priceGems: 15,
    icon: '☕',
  },
  {
    id: 'assistant',
    name: 'Assistent',
    description: '+50% passief inkomen',
    incomeBonus: 0.5,
    durationHours: 4,
    priceGems: 40,
    icon: '🧑‍🔧',
  },
  {
    id: 'city_deal',
    name: 'Stadsdeal',
    description: '+100% inkomen en 25% kans op dubbele opbrengst',
    incomeBonus: 1,
    spawnBonus: 0.25,
    durationHours: 8,
    priceGems: 90,
    icon: '🤝',
  },
  {
    id: 'golden_hour',
    name: 'Gouden Uur',
    description: '+200% inkomen en 50% kans op dubbele opbrengst',
    incomeBonus: 2,
    spawnBonus: 0.5,
    durationHours: 1,
    priceGems: 120,
    icon: '🌇',
  },
] as const;

export const BOOSTS_BY_ID: Readonly<Record<string, BoostDef>> = Object.fromEntries(
  BOOSTS.map((b) => [b.id, b]),
);
