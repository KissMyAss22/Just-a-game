import { hashSeed, mulberry32 } from './rng';
import type { Rarity, Reward } from './types';

/**
 * Season pass: elke 28 dagen een nieuw seizoen met 50 tiers, een gratis spoor
 * en een premium spoor. Het premium spoor geeft met opzet net genoeg gems
 * terug om het volgende seizoen te kunnen ontgrendelen — dat voelt eerlijk en
 * houdt actieve spelers vast.
 *
 * Alles hier is deterministisch afgeleid van de tijd, zodat client en server
 * het altijd eens zijn over welk seizoen er loopt.
 */
export const SEASON = {
  durationDays: 28,
  tiers: 50,
  xpPerTier: 1_000,
  /** Prijs van het premium spoor in gems. */
  premiumPriceGems: 950,
  /** Maandag 5 januari 2026, 00:00 UTC — begin van seizoen 1. */
  epoch: Date.UTC(2026, 0, 5),
} as const;

export const SEASON_DURATION_MS = SEASON.durationDays * 86_400_000;

export interface SeasonWindow {
  /** Seizoen 1, 2, 3, ... */
  index: number;
  name: string;
  startsAt: number;
  endsAt: number;
}

/** Welk seizoen loopt er op dit moment (servertijd). */
export function seasonForTimestamp(now: number): SeasonWindow {
  const elapsed = now - SEASON.epoch;
  const index = Math.max(0, Math.floor(elapsed / SEASON_DURATION_MS)) + 1;
  const startsAt = SEASON.epoch + (index - 1) * SEASON_DURATION_MS;
  return {
    index,
    name: SEASON_NAMES[(index - 1) % SEASON_NAMES.length] ?? `Seizoen ${index}`,
    startsAt,
    endsAt: startsAt + SEASON_DURATION_MS,
  };
}

export const SEASON_NAMES: readonly string[] = [
  'Nieuwe Stad',
  'Neonnachten',
  'Havenlicht',
  'Hoogbouw',
  'Zomerhitte',
  'Asfalt',
  'Goudkoorts',
  'Stormtij',
  'Hoogseizoen',
  'Middernacht',
  'Wolkenkrabber',
  'Laatste Ronde',
] as const;

export interface SeasonTierDef {
  tier: number;
  /** XP die je in totaal nodig hebt om deze tier te halen. */
  xpRequired: number;
  free: readonly Reward[];
  premium: readonly Reward[];
}

/**
 * De beloningstabel wordt berekend in plaats van uitgetypt: dat houdt de
 * curve consistent en maakt balanceren een kwestie van deze functie aanpassen.
 */
function buildSeasonTiers(): SeasonTierDef[] {
  const tiers: SeasonTierDef[] = [];
  for (let tier = 1; tier <= SEASON.tiers; tier++) {
    const scale = Math.pow(1.12, tier - 1);
    const free: Reward[] = [];
    const premium: Reward[] = [];

    // Gratis spoor: elke tweede tier iets, met mijlpalen onderweg.
    if (tier % 2 === 0) {
      free.push({ kind: 'cash', amount: Math.round(400 * scale) });
    }
    if (tier % 10 === 0) {
      free.push({ kind: 'gems', amount: 25 });
    }
    if (tier === 15) free.push({ kind: 'item', itemId: 'arcade', amount: 1 });
    if (tier === 35) free.push({ kind: 'vehicle', vehicleId: 'scooter' });
    if (tier === SEASON.tiers) free.push({ kind: 'item', itemId: 'painting', amount: 1 });

    // Premium spoor: elke tier iets.
    premium.push({ kind: 'cash', amount: Math.round(900 * scale) });
    if (tier % 5 === 0) premium.push({ kind: 'gems', amount: 90 });
    if (tier % 7 === 0) premium.push({ kind: 'boost', boostId: 'city_deal', hours: 4 });
    if (tier === 10) premium.push({ kind: 'item', itemId: 'aquarium', amount: 1 });
    if (tier === 20) premium.push({ kind: 'item', itemId: 'piano', amount: 1 });
    if (tier === 30) premium.push({ kind: 'vehicle', vehicleId: 'sedan' });
    if (tier === 40) premium.push({ kind: 'item', itemId: 'sculpture', amount: 1 });
    if (tier === SEASON.tiers) {
      premium.push({ kind: 'item', itemId: 'chandelier', amount: 1 });
      // Wie de pass uitspeelt verdient het volgende seizoen terug.
      premium.push({ kind: 'gems', amount: 100 });
    }

    tiers.push({ tier, xpRequired: tier * SEASON.xpPerTier, free, premium });
  }
  return tiers;
}

export const SEASON_TIERS: readonly SeasonTierDef[] = buildSeasonTiers();

/** Totaal aantal gems in het premium spoor — moet ≥ de prijs zijn. */
export const PREMIUM_GEMS_TOTAL = SEASON_TIERS.reduce(
  (sum, t) =>
    sum + t.premium.reduce((s, r) => s + (r.kind === 'gems' ? r.amount : 0), 0),
  0,
);

/** Hoogste tier die je met deze hoeveelheid season-XP hebt gehaald. */
export function tierForXp(seasonXp: number): number {
  return Math.max(0, Math.min(SEASON.tiers, Math.floor(seasonXp / SEASON.xpPerTier)));
}

export interface SeasonProgressView {
  tier: number;
  xpIntoTier: number;
  xpForNextTier: number;
  seasonXp: number;
}

export function seasonProgress(seasonXp: number): SeasonProgressView {
  const xp = Math.max(0, Math.floor(seasonXp));
  const tier = tierForXp(xp);
  return {
    tier,
    xpIntoTier: tier >= SEASON.tiers ? SEASON.xpPerTier : xp % SEASON.xpPerTier,
    xpForNextTier: SEASON.xpPerTier,
    seasonXp: xp,
  };
}

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

export type QuestScope = 'daily' | 'weekly';

export type QuestMetric =
  | 'collect_items'
  | 'collect_rarity'
  | 'sell_value'
  | 'collect_income'
  | 'place_items'
  | 'buy_upgrades'
  | 'distance';

export interface QuestDef {
  id: string;
  name: string;
  description: string;
  scope: QuestScope;
  metric: QuestMetric;
  target: number;
  seasonXp: number;
  rarity?: Rarity;
  reward?: Reward;
}

export const QUESTS: readonly QuestDef[] = [
  // --- dagelijks ----------------------------------------------------------
  { id: 'd_collect_15', name: 'Straatveger', description: 'Raap 15 items op in de stad', scope: 'daily', metric: 'collect_items', target: 15, seasonXp: 180 },
  { id: 'd_collect_40', name: 'Verzamelwoede', description: 'Raap 40 items op in de stad', scope: 'daily', metric: 'collect_items', target: 40, seasonXp: 320 },
  { id: 'd_rare_3', name: 'Goede vangst', description: 'Vind 3 zeldzame items of beter', scope: 'daily', metric: 'collect_rarity', target: 3, rarity: 'rare', seasonXp: 260 },
  { id: 'd_sell_5k', name: 'Handelaar', description: 'Verkoop voor 5.000 aan items', scope: 'daily', metric: 'sell_value', target: 5_000, seasonXp: 220 },
  { id: 'd_income_1', name: 'Kluis legen', description: 'Haal 1 keer je passieve inkomen op', scope: 'daily', metric: 'collect_income', target: 1, seasonXp: 120 },
  { id: 'd_place_2', name: 'Woonstijl', description: 'Plaats 2 items in je base', scope: 'daily', metric: 'place_items', target: 2, seasonXp: 200 },
  { id: 'd_walk_2km', name: 'Stadswandeling', description: 'Leg 2 km af door de stad', scope: 'daily', metric: 'distance', target: 2_000, seasonXp: 160 },
  { id: 'd_upgrade_1', name: 'Verbeteren', description: 'Koop 1 base-upgrade', scope: 'daily', metric: 'buy_upgrades', target: 1, seasonXp: 240 },

  // --- wekelijks ----------------------------------------------------------
  { id: 'w_collect_250', name: 'Stofzuiger', description: 'Raap 250 items op', scope: 'weekly', metric: 'collect_items', target: 250, seasonXp: 900, reward: { kind: 'gems', amount: 40 } },
  { id: 'w_epic_5', name: 'Schatgraver', description: 'Vind 5 epische items of beter', scope: 'weekly', metric: 'collect_rarity', target: 5, rarity: 'epic', seasonXp: 1_100, reward: { kind: 'gems', amount: 60 } },
  { id: 'w_sell_150k', name: 'Groothandel', description: 'Verkoop voor 150.000 aan items', scope: 'weekly', metric: 'sell_value', target: 150_000, seasonXp: 950 },
  { id: 'w_place_15', name: 'Interieurbouwer', description: 'Plaats 15 items in je base', scope: 'weekly', metric: 'place_items', target: 15, seasonXp: 850 },
  { id: 'w_upgrade_8', name: 'Investeerder', description: 'Koop 8 base-upgrades', scope: 'weekly', metric: 'buy_upgrades', target: 8, seasonXp: 1_000 },
  { id: 'w_walk_25km', name: 'Marathon', description: 'Leg 25 km af door de stad', scope: 'weekly', metric: 'distance', target: 25_000, seasonXp: 800 },
  { id: 'w_income_20', name: 'Rentenier', description: 'Haal 20 keer je passieve inkomen op', scope: 'weekly', metric: 'collect_income', target: 20, seasonXp: 700 },
] as const;

export const QUESTS_BY_ID: Readonly<Record<string, QuestDef>> = Object.fromEntries(
  QUESTS.map((q) => [q.id, q]),
);

export const DAILY_QUEST_COUNT = 3;
export const WEEKLY_QUEST_COUNT = 5;

/**
 * Kiest zonder herhaling `count` quests uit een pool. Deterministisch per
 * speler en per periode: iedereen krijgt zijn eigen set, maar de server kan
 * hem altijd herberekenen.
 */
export function pickQuests(
  scope: QuestScope,
  playerSeed: number,
  periodIndex: number,
): QuestDef[] {
  const pool = QUESTS.filter((q) => q.scope === scope);
  const count = scope === 'daily' ? DAILY_QUEST_COUNT : WEEKLY_QUEST_COUNT;
  const next = mulberry32(hashSeed(playerSeed, periodIndex, scope.length));
  const remaining = [...pool];
  const picked: QuestDef[] = [];
  while (picked.length < count && remaining.length > 0) {
    const index = Math.floor(next() * remaining.length);
    const [quest] = remaining.splice(Math.min(index, remaining.length - 1), 1);
    if (quest) picked.push(quest);
  }
  return picked;
}

/** Dagnummer sinds epoch — de periode voor dagelijkse quests. */
export function dayIndex(now: number): number {
  return Math.floor(now / 86_400_000);
}

/** Weeknummer sinds epoch — de periode voor wekelijkse quests. */
export function weekIndex(now: number): number {
  return Math.floor((now - SEASON.epoch) / (7 * 86_400_000));
}
