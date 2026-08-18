/**
 * Rebirth.
 *
 * Op een gegeven moment is elke upgrade gekocht en wordt de curve saai. Met
 * een rebirth geef je alles op — je geld, je woning, je auto's, je level — en
 * krijg je er **erfenis** voor terug: een blijvende valuta die je uitgeeft aan
 * permanente voordelen. De volgende keer ga je dus sneller dan de vorige.
 *
 * Twee ontwerpkeuzes die het geheel bij elkaar houden:
 *
 * 1. `lifetimeEarned` wordt nooit gereset. Je erfenis wordt daaruit berekend
 *    met een wortelfunctie, en je krijgt bij elke rebirth alleen het verschil
 *    met wat je al hebt gehad. Daardoor kost elke volgende rebirth vanzelf
 *    meer dan de vorige, zonder dat er ergens een aparte teller bij hoeft.
 * 2. Erfenis is een *valuta*, geen vlakke multiplier. Je kiest zelf of je
 *    inkomen, opbrengst, ervaring of gemak koopt — dat maakt elke rebirth een
 *    beslissing in plaats van een knop.
 */

export const REBIRTH = {
  /** Levenslange opbrengst die één "eenheid" onder de wortel is. */
  earningsScale: 1_000_000,
  /** Schaal van de erfenisformule. */
  pointsFactor: 12,
  /** Level dat je minimaal moet hebben. */
  requiredLevel: 20,
  /** Minimale winst; anders is het het weggooien van je voortgang niet waard. */
  minimumGain: 10,
} as const;

/**
 * Hoeveel erfenis je levenslange opbrengst in totaal waard is.
 * Een wortel, zodat de eerste miljoenen veel opleveren en de latere steeds
 * minder — precies de curve die een incremental spel lang interessant houdt.
 */
export function erfenisFor(lifetimeEarned: number): number {
  if (lifetimeEarned <= 0) return 0;
  return Math.floor(REBIRTH.pointsFactor * Math.sqrt(lifetimeEarned / REBIRTH.earningsScale));
}

/** Wat een rebirth op dit moment zou opleveren. */
export function pendingErfenis(lifetimeEarned: number, erfenisClaimed: number): number {
  return Math.max(0, erfenisFor(lifetimeEarned) - Math.max(0, Math.floor(erfenisClaimed)));
}

export interface RebirthReadiness {
  pending: number;
  hasLevel: boolean;
  hasGain: boolean;
  canRebirth: boolean;
  /** Levenslange opbrengst die nodig is voor de eerstvolgende rebirth. */
  earningsNeeded: number;
}

export function checkRebirth(
  level: number,
  lifetimeEarned: number,
  erfenisClaimed: number,
): RebirthReadiness {
  const pending = pendingErfenis(lifetimeEarned, erfenisClaimed);
  const hasLevel = level >= REBIRTH.requiredLevel;
  const hasGain = pending >= REBIRTH.minimumGain;

  // Terugrekenen: hoeveel moet er in totaal verdiend zijn voor genoeg winst?
  const targetPoints = Math.max(0, Math.floor(erfenisClaimed)) + REBIRTH.minimumGain;
  const earningsNeeded = Math.ceil(
    Math.pow(targetPoints / REBIRTH.pointsFactor, 2) * REBIRTH.earningsScale,
  );

  return { pending, hasLevel, hasGain, canRebirth: hasLevel && hasGain, earningsNeeded };
}

// ---------------------------------------------------------------------------
// Permanente voordelen
// ---------------------------------------------------------------------------

export type LegacyEffect =
  | 'income'
  | 'sell'
  | 'xp'
  | 'offlineCap'
  | 'moveSpeed'
  | 'headstart';

export interface LegacyPerkDef {
  id: string;
  name: string;
  description: string;
  effect: LegacyEffect;
  /** Effect per level; betekenis hangt af van `effect`. */
  perLevel: number;
  maxLevel: number;
  /** Kosten van het eerste level, in erfenis. */
  baseCost: number;
  /** Elke volgende level kost deze factor meer. */
  growth: number;
  icon: string;
}

export const LEGACY_PERKS: readonly LegacyPerkDef[] = [
  {
    id: 'legacy_income',
    name: 'Imperium',
    description: '+3% passief inkomen, voor altijd',
    effect: 'income',
    perLevel: 0.03,
    maxLevel: 50,
    baseCost: 3,
    growth: 1.4,
    icon: '🏛️',
  },
  {
    id: 'legacy_sell',
    name: 'Onderhandelaar',
    description: '+2% opbrengst bij verkoop',
    effect: 'sell',
    perLevel: 0.02,
    maxLevel: 30,
    baseCost: 4,
    growth: 1.45,
    icon: '🤝',
  },
  {
    id: 'legacy_xp',
    name: 'Ervaring',
    description: '+4% ervaring, dus sneller weer op niveau',
    effect: 'xp',
    perLevel: 0.04,
    maxLevel: 25,
    baseCost: 4,
    growth: 1.45,
    icon: '🧠',
  },
  {
    id: 'legacy_offline',
    name: 'Nachtploeg',
    description: '+1 uur offline inkomen',
    effect: 'offlineCap',
    perLevel: 1,
    maxLevel: 12,
    baseCost: 6,
    growth: 1.55,
    icon: '🌙',
  },
  {
    id: 'legacy_speed',
    name: 'Stadskennis',
    description: '+2% loopsnelheid',
    effect: 'moveSpeed',
    perLevel: 0.02,
    maxLevel: 20,
    baseCost: 5,
    growth: 1.4,
    icon: '🗺️',
  },
  {
    id: 'legacy_headstart',
    name: 'Startkapitaal',
    description: '+25.000 cash bij elke volgende rebirth',
    effect: 'headstart',
    perLevel: 25_000,
    maxLevel: 10,
    baseCost: 8,
    growth: 1.7,
    icon: '💼',
  },
] as const;

export const LEGACY_PERKS_BY_ID: Readonly<Record<string, LegacyPerkDef>> = Object.fromEntries(
  LEGACY_PERKS.map((p) => [p.id, p]),
);

export function getLegacyPerk(id: string): LegacyPerkDef {
  const perk = LEGACY_PERKS_BY_ID[id];
  if (!perk) throw new Error(`Onbekend erfenis-voordeel: ${id}`);
  return perk;
}

/** Kosten om van `currentLevel` naar `currentLevel + 1` te gaan. */
export function legacyCost(perk: LegacyPerkDef, currentLevel: number): number {
  return Math.ceil(perk.baseCost * Math.pow(perk.growth, Math.max(0, currentLevel)));
}

/** Het level van een voordeel, geklemd op wat er echt bestaat. */
export function legacyLevel(levels: Readonly<Record<string, number>>, id: string): number {
  const perk = LEGACY_PERKS_BY_ID[id];
  if (!perk) return 0;
  const raw = levels[id] ?? 0;
  return Math.max(0, Math.min(perk.maxLevel, Math.floor(raw)));
}

export interface LegacyBonuses {
  /** Vermenigvuldiger op passief inkomen, bv. 1.3 = +30%. */
  income: number;
  /** Vermenigvuldiger op verkoopopbrengst. */
  sell: number;
  /** Vermenigvuldiger op ervaring. */
  xp: number;
  /** Extra uren offline inkomen. */
  offlineCapHours: number;
  /** Vermenigvuldiger op loopsnelheid. */
  moveSpeed: number;
  /** Cash waarmee je na een rebirth begint. */
  headstartCash: number;
}

/** Alle permanente voordelen bij elkaar, klaar om toe te passen. */
export function legacyBonuses(levels: Readonly<Record<string, number>>): LegacyBonuses {
  return {
    income: 1 + legacyLevel(levels, 'legacy_income') * getLegacyPerk('legacy_income').perLevel,
    sell: 1 + legacyLevel(levels, 'legacy_sell') * getLegacyPerk('legacy_sell').perLevel,
    xp: 1 + legacyLevel(levels, 'legacy_xp') * getLegacyPerk('legacy_xp').perLevel,
    offlineCapHours:
      legacyLevel(levels, 'legacy_offline') * getLegacyPerk('legacy_offline').perLevel,
    moveSpeed: 1 + legacyLevel(levels, 'legacy_speed') * getLegacyPerk('legacy_speed').perLevel,
    headstartCash:
      legacyLevel(levels, 'legacy_headstart') * getLegacyPerk('legacy_headstart').perLevel,
  };
}

/**
 * Wat een rebirth wegvaagt. Staat hier zodat de app precies dezelfde lijst kan
 * tonen als de server uitvoert — niemand mag verrast worden.
 */
export const REBIRTH_RESETS: readonly string[] = [
  'Je geld',
  'Je level en ervaring',
  'Je woning en alles wat erin staat',
  'Al je voertuigen',
  'Al je base-upgrades',
  'Alles in je rugzak',
] as const;

export const REBIRTH_KEEPS: readonly string[] = [
  'Je erfenis en alles wat je ermee koopt',
  'Je gems',
  'Je personage: naam en uiterlijk',
  'Je season pass-voortgang',
  'Je levenslange opbrengst, dus je volgende rebirth telt door',
] as const;
