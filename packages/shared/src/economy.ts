import { getItem } from './items';
import { getProperty } from './properties';
import { legacyBonuses } from './rebirth';
import { RARITY_VALUE_MULTIPLIER, type ItemDef, BOOSTS_BY_ID } from './types';
import { getVehicle } from './vehicles';

/**
 * Alle economische afstelknoppen op één plek. Balanceren is hier getallen
 * veranderen; de formules eronder blijven gelijk.
 */
export const ECONOMY = {
  /** Kostencurve: elke upgrade kost 15% meer dan de vorige. */
  costGrowth: 1.15,
  /** Flex Score gedeeld door deze waarde = inkomstenbonus (1.0 = +100%). */
  flexDivisor: 2_000,
  maxFlexMultiplier: 5,
  /** Inventarisplekken zonder voertuig of upgrades. */
  baseInventorySlots: 20,
  /** Loopsnelheid in meter per seconde. */
  baseMoveSpeed: 6,
  /** Straal waarbinnen je een item kunt oppakken, in meters. */
  basePickupRadius: 2.2,
  levelXpBase: 80,
  levelXpExponent: 1.45,
  levelCap: 100,
  /** Alles onder deze waarde telt als "geen inkomen". */
  epsilon: 1e-9,
} as const;

// ---------------------------------------------------------------------------
// Levels en ervaring
// ---------------------------------------------------------------------------

/** XP die nodig is om van `level` naar `level + 1` te gaan. */
export function xpForNextLevel(level: number): number {
  if (level >= ECONOMY.levelCap) return Infinity;
  return Math.floor(ECONOMY.levelXpBase * Math.pow(level, ECONOMY.levelXpExponent));
}

export interface LevelProgress {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  totalXp: number;
}

/** Rekent totale XP om naar een level plus voortgang binnen dat level. */
export function levelFromTotalXp(totalXp: number): LevelProgress {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (level < ECONOMY.levelCap) {
    const needed = xpForNextLevel(level);
    if (remaining < needed) break;
    remaining -= needed;
    level += 1;
  }
  return {
    level,
    xpIntoLevel: remaining,
    xpForNext: xpForNextLevel(level),
    totalXp: Math.max(0, Math.floor(totalXp)),
  };
}

/** XP die je krijgt voor het oppakken van een item. */
export function xpForItem(item: ItemDef): number {
  return Math.max(1, Math.round(RARITY_VALUE_MULTIPLIER[item.rarity] * 2));
}

// ---------------------------------------------------------------------------
// Upgrades
// ---------------------------------------------------------------------------

export type UpgradeEffect =
  | 'vaultCapacity'
  | 'offlineCap'
  | 'income'
  | 'inventory'
  | 'pickupRadius'
  | 'manager';

/**
 * De manager int je kluis automatisch, dus die loopt nooit meer over — maar
 * hij houdt wel commissie in. Elk managerlevel verlaagt die commissie.
 *
 * Zo blijven alle drie de knoppen zinvol: vroeg upgrade je de kluis omdat je
 * zelf int, halverwege neem je een manager om niets meer te verliezen, en
 * daarna koop je de commissie omlaag.
 */
export const MANAGER = {
  /** Commissie bij managerlevel 1. */
  baseFee: 0.3,
  /** Hoeveel de commissie per extra level daalt. */
  feePerLevel: 0.05,
} as const;

/** Commissie die de manager inhoudt, 0 als je er geen hebt. */
export function managerFee(level: number): number {
  if (level <= 0) return 0;
  return Math.max(0.05, MANAGER.baseFee - (level - 1) * MANAGER.feePerLevel);
}

export interface BaseUpgradeDef {
  id: string;
  name: string;
  description: string;
  baseCost: number;
  maxLevel: number;
  effect: UpgradeEffect;
  /** Effect per level; betekenis hangt af van `effect`. */
  perLevel: number;
  icon: string;
}

export const BASE_UPGRADES: readonly BaseUpgradeDef[] = [
  {
    id: 'vault',
    name: 'Kluis',
    description: '+25% opslag voordat je inkomen overloopt',
    baseCost: 800,
    maxLevel: 12,
    effect: 'vaultCapacity',
    perLevel: 0.25,
    icon: '🏦',
  },
  {
    id: 'generator',
    name: 'Aggregaat',
    description: '+1 uur offline inkomen',
    baseCost: 1_500,
    maxLevel: 10,
    effect: 'offlineCap',
    perLevel: 1,
    icon: '🔋',
  },
  {
    id: 'bookkeeper',
    name: 'Boekhouder',
    description: '+6% passief inkomen',
    baseCost: 2_200,
    maxLevel: 25,
    effect: 'income',
    perLevel: 0.06,
    icon: '📈',
  },
  {
    id: 'backpack',
    name: 'Rugzak',
    description: '+4 inventarisplekken',
    baseCost: 600,
    maxLevel: 12,
    effect: 'inventory',
    perLevel: 4,
    icon: '🎒',
  },
  {
    id: 'magnet',
    name: 'Magneet',
    description: '+0,6 m oppakafstand',
    baseCost: 1_100,
    maxLevel: 8,
    effect: 'pickupRadius',
    perLevel: 0.6,
    icon: '🧲',
  },
  {
    id: 'manager',
    name: 'Manager',
    description: 'Int je kluis automatisch; elk level kost minder commissie',
    baseCost: 9_000,
    maxLevel: 6,
    effect: 'manager',
    perLevel: MANAGER.feePerLevel,
    icon: '🧑‍💼',
  },
] as const;

export const BASE_UPGRADES_BY_ID: Readonly<Record<string, BaseUpgradeDef>> =
  Object.fromEntries(BASE_UPGRADES.map((u) => [u.id, u]));

export function getUpgrade(id: string): BaseUpgradeDef {
  const u = BASE_UPGRADES_BY_ID[id];
  if (!u) throw new Error(`Onbekende upgrade: ${id}`);
  return u;
}

/** Kosten om van `currentLevel` naar `currentLevel + 1` te gaan. */
export function upgradeCost(
  baseCost: number,
  currentLevel: number,
  growth: number = ECONOMY.costGrowth,
): number {
  return Math.ceil(baseCost * Math.pow(growth, currentLevel));
}

// ---------------------------------------------------------------------------
// Afgeleide spelerstatistieken
// ---------------------------------------------------------------------------

export interface PlacementInput {
  itemId: string;
  quantity: number;
}

export interface StatsInput {
  propertyId: string;
  vehicleId: string;
  /** upgrade-id -> huidig level */
  upgrades: Readonly<Record<string, number>>;
  /** Items die in je base staan; alleen die tellen mee voor inkomen en flex. */
  placements: readonly PlacementInput[];
  /** Actieve tijdelijke boosts. */
  activeBoostIds?: readonly string[];
  /** Permanente voordelen uit rebirths: perk-id -> level. */
  legacy?: Readonly<Record<string, number>>;
}

export interface PlayerStats {
  /** Passief inkomen per uur, inclusief alle multipliers. */
  incomePerHour: number;
  /** Inkomen vóór multipliers — handig om de UI uit te leggen. */
  baseIncomePerHour: number;
  flexScore: number;
  flexMultiplier: number;
  boostMultiplier: number;
  upgradeMultiplier: number;
  vaultCapacity: number;
  offlineCapHours: number;
  inventorySlots: number;
  moveSpeed: number;
  pickupRadius: number;
  /** Met een manager loopt de kluis niet over: hij wordt continu geleegd. */
  autoCollect: boolean;
  /** Deel dat de manager inhoudt, 0..1. */
  managerFee: number;
  /** Kans op een dubbele opbrengst bij het oprapen, uit actieve boosts. */
  doubleDropChance: number;
  /** Permanente vermenigvuldiger op inkomen uit rebirths. */
  legacyMultiplier: number;
  /** Permanente vermenigvuldiger op verkoopopbrengst. */
  sellMultiplier: number;
  /** Permanente vermenigvuldiger op ervaring. */
  xpMultiplier: number;
}

function upgradeLevel(upgrades: Readonly<Record<string, number>>, id: string): number {
  const def = BASE_UPGRADES_BY_ID[id];
  const raw = upgrades[id] ?? 0;
  if (!def) return 0;
  return Math.max(0, Math.min(def.maxLevel, Math.floor(raw)));
}

/** Flex Score omgezet naar een inkomstenmultiplier. */
export function flexMultiplier(flexScore: number): number {
  return Math.min(ECONOMY.maxFlexMultiplier, Math.max(0, flexScore) / ECONOMY.flexDivisor);
}

/**
 * Berekent alle afgeleide waarden van een speler. Client en server gebruiken
 * exact deze functie, zodat de UI nooit iets anders laat zien dan wat de
 * server uitrekent.
 */
export function computeStats(input: StatsInput): PlayerStats {
  const property = getProperty(input.propertyId);
  const vehicle = getVehicle(input.vehicleId);

  let baseIncomePerHour = property.incomePerHour;
  let flexScore = property.flex + vehicle.flex;

  for (const placement of input.placements) {
    const item = getItem(placement.itemId);
    const qty = Math.max(0, Math.floor(placement.quantity));
    baseIncomePerHour += (item.incomePerHour ?? 0) * qty;
    flexScore += (item.flex ?? 0) * qty;
  }

  const vaultLevel = upgradeLevel(input.upgrades, 'vault');
  const generatorLevel = upgradeLevel(input.upgrades, 'generator');
  const bookkeeperLevel = upgradeLevel(input.upgrades, 'bookkeeper');
  const backpackLevel = upgradeLevel(input.upgrades, 'backpack');
  const magnetLevel = upgradeLevel(input.upgrades, 'magnet');

  let boostBonus = 0;
  let doubleDropChance = 0;
  for (const id of input.activeBoostIds ?? []) {
    const boost = BOOSTS_BY_ID[id];
    if (!boost) continue;
    boostBonus += boost.incomeBonus;
    doubleDropChance += boost.spawnBonus ?? 0;
  }
  doubleDropChance = Math.min(0.9, doubleDropChance);

  const managerLvl = upgradeLevel(input.upgrades, 'manager');

  const legacy = legacyBonuses(input.legacy ?? {});

  const flexMult = flexMultiplier(flexScore);
  const upgradeMult = 1 + bookkeeperLevel * getUpgrade('bookkeeper').perLevel;
  const boostMult = 1 + boostBonus;
  const incomePerHour =
    baseIncomePerHour * (1 + flexMult) * upgradeMult * boostMult * legacy.income;

  return {
    incomePerHour: Math.round(incomePerHour * 100) / 100,
    baseIncomePerHour,
    flexScore,
    flexMultiplier: flexMult,
    boostMultiplier: boostMult,
    upgradeMultiplier: upgradeMult,
    vaultCapacity: Math.floor(
      property.vaultCapacity * (1 + vaultLevel * getUpgrade('vault').perLevel),
    ),
    offlineCapHours:
      property.offlineCapHours +
      generatorLevel * getUpgrade('generator').perLevel +
      legacy.offlineCapHours,
    inventorySlots:
      ECONOMY.baseInventorySlots + vehicle.carryBonus + backpackLevel * getUpgrade('backpack').perLevel,
    moveSpeed: ECONOMY.baseMoveSpeed * vehicle.speedMultiplier * legacy.moveSpeed,
    pickupRadius: ECONOMY.basePickupRadius + magnetLevel * getUpgrade('magnet').perLevel,
    autoCollect: managerLvl > 0,
    managerFee: managerFee(managerLvl),
    doubleDropChance,
    legacyMultiplier: legacy.income,
    sellMultiplier: legacy.sell,
    xpMultiplier: legacy.xp,
  };
}

/**
 * De capaciteit waarmee daadwerkelijk gerekend wordt. Met een manager is die
 * onbegrensd, omdat de kluis continu wordt geleegd — `vaultCapacity` blijft
 * dan alleen nog de waarde die de app in de balk laat zien.
 */
export function accrualCapacity(stats: PlayerStats): number {
  return stats.autoCollect ? Number.POSITIVE_INFINITY : stats.vaultCapacity;
}

/** Wat er van een automatische inning overblijft na commissie. */
export function afterManagerFee(amount: number, fee: number): { net: number; fee: number } {
  const commission = Math.floor(amount * fee);
  return { net: Math.max(0, amount - commission), fee: commission };
}

// ---------------------------------------------------------------------------
// Idle-inkomen
// ---------------------------------------------------------------------------

export interface AccrualInput {
  ratePerHour: number;
  /** Servertijd (ms) tot waar het inkomen al is bijgeschreven. */
  accruedAt: number;
  /** Huidige servertijd (ms). Nooit de telefoonklok gebruiken. */
  now: number;
  offlineCapHours: number;
  vaultBalance: number;
  vaultCapacity: number;
}

export interface AccrualResult {
  /** Hele eenheden die aan de kluis zijn toegevoegd. */
  earned: number;
  vaultBalance: number;
  /** Nieuwe waarde voor `accruedAt`; sla deze op. */
  accruedAt: number;
  /** Tijd die is meegeteld, in seconden. */
  secondsCounted: number;
  /** Tijd die verloren ging doordat je langer dan de cap weg was. */
  secondsLostToCap: number;
  cappedByTime: boolean;
  cappedByVault: boolean;
  /** Seconden tot de kluis vol is (Infinity als dat nooit gebeurt). */
  secondsUntilFull: number;
}

/**
 * Rekent uit hoeveel passief inkomen er sinds `accruedAt` is bijgekomen.
 *
 * Twee details die er echt toe doen:
 * 1. Er wordt alleen in hele eenheden bijgeschreven, en `accruedAt` schuift
 *    precies zoveel op als er is uitbetaald. Zo gaat er bij vaak inloggen geen
 *    fractie verloren (de klassieke "afronden naar 0"-bug in idle games).
 * 2. Tijd boven de offline-cap verdwijnt echt: `accruedAt` schuift alsnog op
 *    naar `now - cap`, zodat je niet oneindig kunt bank-sparen.
 */
export function accrueIncome(input: AccrualInput): AccrualResult {
  const rate = Math.max(0, input.ratePerHour);
  const capMs = Math.max(0, input.offlineCapHours) * 3_600_000;
  const elapsedMs = Math.max(0, input.now - input.accruedAt);
  const countedMs = Math.min(elapsedMs, capMs);
  const lostMs = elapsedMs - countedMs;
  const windowStart = input.accruedAt + lostMs;

  const capacity = Math.max(0, input.vaultCapacity);
  const balance = Math.max(0, Math.min(input.vaultBalance, capacity));
  const space = Math.max(0, capacity - balance);

  const raw = rate * (countedMs / 3_600_000);
  const earned = Math.floor(Math.min(raw, space));
  const consumedMs =
    rate > ECONOMY.epsilon ? Math.min(countedMs, (earned / rate) * 3_600_000) : countedMs;

  const nextBalance = balance + earned;
  const remainingSpace = Math.max(0, capacity - nextBalance);

  return {
    earned,
    vaultBalance: nextBalance,
    accruedAt: windowStart + consumedMs,
    secondsCounted: countedMs / 1000,
    secondsLostToCap: lostMs / 1000,
    cappedByTime: lostMs > 0,
    cappedByVault: raw > space + ECONOMY.epsilon,
    secondsUntilFull:
      rate > ECONOMY.epsilon ? (remainingSpace / rate) * 3_600 : Infinity,
  };
}

/** Verkoopwaarde van een stapel items. */
export function stackValue(itemId: string, quantity: number, market = 1): number {
  const item = getItem(itemId);
  return Math.round(
    item.baseValue * RARITY_VALUE_MULTIPLIER[item.rarity] * market * Math.max(0, quantity),
  );
}

/** Kort, leesbaar getal voor de UI: 1.2K, 3.4M, 8.9B. */
export function formatMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs < 1_000) return `${sign}${Math.floor(abs)}`;
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let scaled = abs;
  let unitIndex = -1;
  while (scaled >= 1_000 && unitIndex < units.length - 1) {
    scaled /= 1_000;
    unitIndex += 1;
  }
  const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  return `${sign}${scaled.toFixed(digits)}${units[unitIndex]}`;
}

/** Leesbare duur, bv. "3u 12m". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '∞';
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  if (d > 0) return `${d}d ${h}u`;
  if (h > 0) return `${h}u ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
