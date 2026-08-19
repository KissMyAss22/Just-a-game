import {
  BASE_UPGRADES,
  ECONOMY,
  accrualCapacity,
  accrueIncome,
  computeStats,
  getUpgrade,
  levelFromTotalXp,
  upgradeCost,
  xpForItem,
  type PlayerStats,
} from '../src/economy';
import {
  checkPlacement,
  findFreeSpot,
  floorPlanFor,
  isPlaceable,
  placeableCells,
  type PlacedItem,
} from '../src/home';
import { ITEMS, getItem, pickItemForDistrict, sellValue } from '../src/items';
import { PROPERTIES, STARTER_PROPERTY_ID, getProperty } from '../src/properties';
import {
  LEGACY_PERKS,
  checkRebirth,
  legacyCost,
  type LegacyPerkDef,
} from '../src/rebirth';
import { mulberry32, weightedPick } from '../src/rng';
import { DISTRICTS, type DistrictDef } from '../src/city/districts';
import type { Rarity } from '../src/types';
import { STARTER_VEHICLE_ID, VEHICLES, getVehicle } from '../src/vehicles';

/**
 * Balanssimulatie: een virtuele speler die tegen de échte formules speelt.
 *
 * AANNAMES — lees deze eerst, want de uitkomst is niet beter dan wat hier
 * staat:
 *
 * 1. De speler is efficiënt maar niet alwetend: hij koopt steeds het ding met
 *    de beste verhouding tussen extra inkomen en prijs. Een echte speler koopt
 *    slechter, dus de simulatie is de *snelle* kant van de werkelijkheid.
 * 2. Oprapen gaat met een vast tempo, geschaald met de snelheid van je
 *    voertuig (wortel, want sneller rijden levert niet evenredig meer op).
 * 3. De marktprijs staat op 1,0 in plaats van de dagelijkse schommeling
 *    tussen 0,85 en 1,25 — anders meet je ruis in plaats van de curve.
 * 4. De speler speelt altijd in het beste district dat zijn level toelaat.
 * 5. Hij leegt zijn kluis aan het begin van elke sessie.
 * 6. Hij doet een rebirth zodra het mag, met minstens een dag ertussen.
 *
 * De simulatie zegt dus niet "zo voelt het spel", maar "zo gedraagt de
 * wiskunde zich". Voor het gevoel moet je spelen.
 */

export interface SimConfig {
  /** Items per minuut tijdens actief spelen, te voet. */
  itemsPerMinute: number;
  /** Minuten actief spelen per dag. */
  activeMinutesPerDay: number;
  /** In hoeveel sessies die minuten verdeeld zijn. */
  sessionsPerDay: number;
  /** Hoeveel dagen er gesimuleerd wordt. */
  days: number;
  seed: number;
  allowRebirth: boolean;
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
  itemsPerMinute: 4,
  activeMinutesPerDay: 45,
  sessionsPerDay: 3,
  days: 30,
  seed: 12345,
  allowRebirth: true,
};

export interface SimEvent {
  minute: number;
  kind: 'upgrade' | 'property' | 'vehicle' | 'level' | 'rebirth' | 'perk' | 'note';
  label: string;
  detail?: string;
}

export interface SimSnapshot {
  day: number;
  cash: number;
  incomePerHour: number;
  activeIncomePerHour: number;
  level: number;
  propertyId: string;
  placed: number;
  slots: number;
  /** Wat 8 uur offline die dag oplevert, in minuten actief spelen. */
  offlineInActiveMinutes: number;
}

export interface SimMetrics {
  /** Eerste aankoop van welke soort dan ook — het eerste beloningsmoment. */
  minutesToFirstPurchase: number | null;
  minutesToProperty: Record<string, number>;
  minutesToLevel20: number | null;
  minutesToFirstRebirth: number | null;
  /** Langste periode zonder aankoop, in minuten actief spelen. */
  longestGapMinutes: number;
  purchases: number;
  rebirths: number;
  finalLevel: number;
  finalIncomePerHour: number;
  /** Deel van alle verdiensten dat uit oprapen komt (0..1). */
  activeIncomeShare: number;
  /**
   * Wat 8 uur offline oplevert, in minuten actief spelen — de mediaan over
   * alle dagen. Aan het eind meten gaf onzin: als de simulatie net na een
   * rebirth stopt lijkt alles ineens waardeloos.
   */
  offlineInActiveMinutes: number;
}

export interface SimResult {
  config: SimConfig;
  events: SimEvent[];
  daily: SimSnapshot[];
  metrics: SimMetrics;
}

interface SimState {
  minute: number;
  cash: number;
  lifetimeEarned: number;
  xp: number;
  propertyId: string;
  vehicleId: string;
  ownedVehicles: Set<string>;
  upgrades: Record<string, number>;
  legacy: Record<string, number>;
  placements: PlacedItem[];
  vaultBalance: number;
  accruedAtMinute: number;
  erfenis: number;
  erfenisClaimed: number;
  rebirths: number;
  lastRebirthMinute: number;
  activeEarned: number;
  passiveEarned: number;
  nextPlacementId: number;
}

const MINUTE_MS = 60_000;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Wat 8 uur offline oplevert, uitgedrukt in minuten actief spelen. Dit is de
 * kernvraag van een idle game: is terugkomen na een nacht de moeite waard?
 */
function offlineWorthInMinutes(
  stats: PlayerStats,
  activePerHour: number,
  config: SimConfig,
): number {
  const offlineValue = Math.min(
    stats.incomePerHour * Math.min(8, stats.offlineCapHours),
    // Zonder manager loopt de kluis over; dan is dát de bovengrens.
    stats.autoCollect ? Number.POSITIVE_INFINITY : stats.vaultCapacity,
  );
  const activePerMinute = (activePerHour * 24) / config.activeMinutesPerDay;
  return activePerMinute > 0 ? offlineValue / activePerMinute : 0;
}

function freshState(): SimState {
  return {
    minute: 0,
    cash: 0,
    lifetimeEarned: 0,
    xp: 0,
    propertyId: STARTER_PROPERTY_ID,
    vehicleId: STARTER_VEHICLE_ID,
    ownedVehicles: new Set([STARTER_VEHICLE_ID]),
    upgrades: {},
    legacy: {},
    placements: [],
    vaultBalance: 0,
    accruedAtMinute: 0,
    erfenis: 0,
    erfenisClaimed: 0,
    rebirths: 0,
    lastRebirthMinute: -Infinity,
    activeEarned: 0,
    passiveEarned: 0,
    nextPlacementId: 1,
  };
}

function statsFor(state: SimState): PlayerStats {
  return computeStats({
    propertyId: state.propertyId,
    vehicleId: state.vehicleId,
    upgrades: state.upgrades,
    placements: state.placements,
    legacy: state.legacy,
  });
}

/** Het beste district dat dit level toelaat. */
function districtFor(level: number): DistrictDef {
  let best = DISTRICTS[0]!;
  for (const district of DISTRICTS) {
    if (district.unlockLevel <= level && district.unlockLevel >= best.unlockLevel) best = district;
  }
  return best;
}

/** Wat een opgeraapt item hier gemiddeld waard is. */
function expectedItemValue(district: DistrictDef): number {
  let total = 0;
  let weightSum = 0;
  for (const [rarity, weight] of Object.entries(district.rarityWeights) as [Rarity, number][]) {
    if (weight <= 0) continue;
    const pool = ITEMS.filter((i) => i.rarity === rarity && !i.craftOnly);
    if (pool.length === 0) continue;
    const average = pool.reduce((sum, item) => sum + sellValue(item, 1), 0) / pool.length;
    total += average * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? total / weightSum : 0;
}

/** Sneller reizen levert meer items op, maar niet evenredig. */
function speedFactor(vehicleId: string): number {
  return Math.sqrt(getVehicle(vehicleId).speedMultiplier);
}

/**
 * Actief inkomen omgerekend naar een bedrag per uur, uitgesmeerd over de dag.
 * Nodig om aankopen te kunnen vergelijken die alleen het oprapen versnellen.
 */
function activeIncomePerHour(state: SimState, stats: PlayerStats, config: SimConfig): number {
  const district = districtFor(levelFromTotalXp(state.xp).level);
  const perMinute = config.itemsPerMinute * speedFactor(state.vehicleId);
  const perDay =
    perMinute * config.activeMinutesPerDay * expectedItemValue(district) * stats.sellMultiplier;
  return perDay / 24;
}

/** Gemiddeld uurinkomen van iets dat je in je base kunt zetten. */
const AVERAGE_PLACEABLE_INCOME =
  ITEMS.filter((i) => i.incomePerHour).reduce((sum, i) => sum + (i.incomePerHour ?? 0), 0) /
  Math.max(1, ITEMS.filter((i) => i.incomePerHour).length);

interface Option {
  kind: 'upgrade' | 'property' | 'vehicle';
  id: string;
  cost: number;
  /** Extra inkomen per uur, inclusief geschatte waarde van extra plekken. */
  gain: number;
}

/** Alles wat de speler nu zou kunnen kopen, met wat het oplevert. */
function options(state: SimState, config: SimConfig): Option[] {
  const level = levelFromTotalXp(state.xp).level;
  const stats = statsFor(state);
  const current = stats.incomePerHour + activeIncomePerHour(state, stats, config);
  const list: Option[] = [];

  for (const upgrade of BASE_UPGRADES) {
    const at = state.upgrades[upgrade.id] ?? 0;
    if (at >= upgrade.maxLevel) continue;
    const cost = upgradeCost(upgrade.baseCost, at);
    const next = computeStats({
      propertyId: state.propertyId,
      vehicleId: state.vehicleId,
      upgrades: { ...state.upgrades, [upgrade.id]: at + 1 },
      placements: state.placements,
      legacy: state.legacy,
    });
    const gain =
      next.incomePerHour + activeIncomePerHour(state, next, config) - current;
    list.push({ kind: 'upgrade', id: upgrade.id, cost, gain });
  }

  const currentTier = getProperty(state.propertyId).tier;
  const nextProperty = PROPERTIES.find((p) => p.tier === currentTier + 1);
  if (nextProperty && level >= nextProperty.requiredLevel) {
    const next = computeStats({
      propertyId: nextProperty.id,
      vehicleId: state.vehicleId,
      upgrades: state.upgrades,
      placements: state.placements,
      legacy: state.legacy,
    });
    // Extra plekken zijn pas geld waard als je ze vult; dat weegt mee.
    const extraSlots = placeableCells(floorPlanFor(nextProperty.id)) - stats.slots;
    const gain =
      next.incomePerHour +
      activeIncomePerHour(state, next, config) -
      current +
      extraSlots * AVERAGE_PLACEABLE_INCOME * 0.6;
    list.push({ kind: 'property', id: nextProperty.id, cost: nextProperty.price, gain });
  }

  for (const vehicle of VEHICLES) {
    if (state.ownedVehicles.has(vehicle.id)) continue;
    if (level < vehicle.requiredLevel) continue;
    if (vehicle.tier <= getVehicle(state.vehicleId).tier) continue;
    const next = computeStats({
      propertyId: state.propertyId,
      vehicleId: vehicle.id,
      upgrades: state.upgrades,
      placements: state.placements,
      legacy: state.legacy,
    });
    const withVehicle = { ...state, vehicleId: vehicle.id };
    const gain =
      next.incomePerHour + activeIncomePerHour(withVehicle, next, config) - current;
    list.push({ kind: 'vehicle', id: vehicle.id, cost: vehicle.price, gain });
  }

  return list;
}

function applyPurchase(state: SimState, option: Option): void {
  state.cash -= option.cost;
  if (option.kind === 'upgrade') {
    state.upgrades[option.id] = (state.upgrades[option.id] ?? 0) + 1;
  } else if (option.kind === 'property') {
    state.propertyId = option.id;
  } else {
    state.ownedVehicles.add(option.id);
    state.vehicleId = option.id;
  }
}

/** Verdient geld en houdt bij waar het vandaan kwam. */
function earn(state: SimState, amount: number, source: 'active' | 'passive'): void {
  if (amount <= 0) return;
  state.cash += amount;
  state.lifetimeEarned += amount;
  if (source === 'active') state.activeEarned += amount;
  else state.passiveEarned += amount;
}

/**
 * Een opgeraapt item belandt in de base als het daar meer waard is dan in de
 * winkel — precies de afweging die een speler ook maakt.
 */
function handleItem(state: SimState, itemId: string, sellMultiplier: number): void {
  const item = getItem(itemId);
  const plan = floorPlanFor(state.propertyId);

  if (isPlaceable(item)) {
    const spot = findFreeSpot(plan, state.placements, itemId);
    if (spot) {
      state.placements.push({ id: `p${state.nextPlacementId++}`, itemId, ...spot });
      return;
    }
    // Vol: vervang het zwakste meubel als dit beter is.
    let worstIndex = -1;
    let worstIncome = item.incomePerHour ?? 0;
    for (let i = 0; i < state.placements.length; i++) {
      const income = getItem(state.placements[i]!.itemId).incomePerHour ?? 0;
      if (income < worstIncome) {
        worstIncome = income;
        worstIndex = i;
      }
    }
    if (worstIndex >= 0) {
      const removed = state.placements[worstIndex]!;
      const rest = state.placements.filter((_, i) => i !== worstIndex);
      const spotForNew = findFreeSpot(plan, rest, itemId);
      if (spotForNew) {
        state.placements = [...rest, { id: `p${state.nextPlacementId++}`, itemId, ...spotForNew }];
        earn(state, sellValue(getItem(removed.itemId), sellMultiplier), 'active');
        return;
      }
    }
  }

  earn(state, sellValue(item, sellMultiplier), 'active');
}

/** Zet de inrichting weer goed nadat de plattegrond is veranderd. */
function refitPlacements(state: SimState): void {
  const plan = floorPlanFor(state.propertyId);
  const keep: PlacedItem[] = [];
  for (const placed of state.placements) {
    if (checkPlacement(plan, keep, placed.itemId, placed.x, placed.z, placed.rotation).ok) {
      keep.push(placed);
      continue;
    }
    const spot = findFreeSpot(plan, keep, placed.itemId);
    if (spot) keep.push({ ...placed, ...spot });
  }
  state.placements = keep;
}

/** Geeft erfenis uit, duurste voordeel eerst zolang het kan. */
function spendErfenis(state: SimState, events: SimEvent[]): void {
  const priority: LegacyPerkDef[] = [...LEGACY_PERKS].sort(
    (a, b) => a.baseCost - b.baseCost,
  );
  let bought = true;
  while (bought) {
    bought = false;
    for (const perk of priority) {
      const at = state.legacy[perk.id] ?? 0;
      if (at >= perk.maxLevel) continue;
      const cost = legacyCost(perk, at);
      if (cost > state.erfenis) continue;
      state.erfenis -= cost;
      state.legacy[perk.id] = at + 1;
      events.push({
        minute: state.minute,
        kind: 'perk',
        label: `${perk.name} → ${at + 1}`,
        detail: `${cost} erfenis`,
      });
      bought = true;
      break;
    }
  }
}

export function simulate(config: SimConfig = DEFAULT_SIM_CONFIG): SimResult {
  const state = freshState();
  const random = mulberry32(config.seed);
  const events: SimEvent[] = [];
  const daily: SimSnapshot[] = [];

  const metrics: SimMetrics = {
    minutesToFirstPurchase: null,
    minutesToProperty: {},
    minutesToLevel20: null,
    minutesToFirstRebirth: null,
    longestGapMinutes: 0,
    purchases: 0,
    rebirths: 0,
    finalLevel: 1,
    finalIncomePerHour: 0,
    activeIncomeShare: 0,
    offlineInActiveMinutes: 0,
  };

  const totalMinutes = config.days * 24 * 60;
  const sessionLength = Math.max(1, Math.round(config.activeMinutesPerDay / config.sessionsPerDay));
  // Sessies liggen verspreid over 16 wakkere uren.
  const sessionStarts = Array.from({ length: config.sessionsPerDay }, (_, i) =>
    Math.round(6 * 60 + (i * 16 * 60) / config.sessionsPerDay),
  );

  let lastPurchaseActiveMinute = 0;
  let activeMinutesElapsed = 0;
  let reportedLevel = 1;

  for (let minute = 0; minute < totalMinutes; minute++) {
    state.minute = minute;
    const minuteOfDay = minute % (24 * 60);
    const stats = statsFor(state);

    // --- passief inkomen bijschrijven ---
    const accrual = accrueIncome({
      ratePerHour: stats.incomePerHour,
      accruedAt: state.accruedAtMinute * MINUTE_MS,
      now: minute * MINUTE_MS,
      offlineCapHours: stats.offlineCapHours,
      vaultBalance: state.vaultBalance,
      vaultCapacity: accrualCapacity(stats),
    });
    state.vaultBalance = accrual.vaultBalance;
    state.accruedAtMinute = accrual.accruedAt / MINUTE_MS;

    // Met een manager gaat het meteen door naar je cash, minus commissie.
    if (stats.autoCollect && state.vaultBalance > 0) {
      const net = Math.floor(state.vaultBalance * (1 - stats.managerFee));
      earn(state, net, 'passive');
      state.vaultBalance = 0;
    }

    const sessionStart = sessionStarts.find((start) => start === minuteOfDay);
    const inSession = sessionStarts.some(
      (start) => minuteOfDay >= start && minuteOfDay < start + sessionLength,
    );

    // --- kluis legen bij het openen van de app ---
    if (sessionStart !== undefined && state.vaultBalance > 0) {
      earn(state, Math.floor(state.vaultBalance), 'passive');
      state.vaultBalance = 0;
    }

    // --- actief spelen ---
    if (inSession) {
      activeMinutesElapsed++;
      const level = levelFromTotalXp(state.xp).level;
      const district = districtFor(level);
      const picks = config.itemsPerMinute * speedFactor(state.vehicleId);
      const whole = Math.floor(picks);
      const extra = random() < picks - whole ? 1 : 0;

      for (let i = 0; i < whole + extra; i++) {
        const rarity = weightedPick<Rarity>(district.rarityWeights, random());
        const item = pickItemForDistrict(district.id, rarity, random());
        if (!item) continue;
        state.xp += Math.round(xpForItem(item) * stats.xpMultiplier);
        handleItem(state, item.id, stats.sellMultiplier);
      }
    }

    // --- kopen wat het meest oplevert ---
    let bought = true;
    while (bought) {
      bought = false;
      const affordable = options(state, config)
        .filter((o) => o.cost <= state.cash && o.gain > 0)
        .sort((a, b) => b.gain / b.cost - a.gain / a.cost);
      const best = affordable[0];
      if (!best) break;

      applyPurchase(state, best);
      if (best.kind === 'property') refitPlacements(state);
      metrics.purchases++;
      metrics.longestGapMinutes = Math.max(
        metrics.longestGapMinutes,
        activeMinutesElapsed - lastPurchaseActiveMinute,
      );
      lastPurchaseActiveMinute = activeMinutesElapsed;

      if (metrics.minutesToFirstPurchase === null) {
        metrics.minutesToFirstPurchase = activeMinutesElapsed;
      }
      if (best.kind === 'property' && metrics.minutesToProperty[best.id] === undefined) {
        metrics.minutesToProperty[best.id] = activeMinutesElapsed;
      }
      events.push({
        minute,
        kind: best.kind,
        label:
          best.kind === 'upgrade'
            ? `${getUpgrade(best.id).name} → ${state.upgrades[best.id]}`
            : best.kind === 'property'
              ? getProperty(best.id).name
              : getVehicle(best.id).name,
        detail: `${Math.round(best.cost)} cash`,
      });
      bought = true;
    }

    // --- level-mijlpalen ---
    const level = levelFromTotalXp(state.xp).level;
    if (level > reportedLevel) {
      reportedLevel = level;
      if (level % 5 === 0 || level === 20) {
        events.push({ minute, kind: 'level', label: `Level ${level}` });
      }
      if (level >= 20 && metrics.minutesToLevel20 === null) {
        metrics.minutesToLevel20 = activeMinutesElapsed;
      }
    }

    // --- rebirth ---
    if (config.allowRebirth && minute - state.lastRebirthMinute > 24 * 60) {
      const readiness = checkRebirth(level, state.lifetimeEarned, state.erfenisClaimed);
      if (readiness.canRebirth) {
        if (metrics.minutesToFirstRebirth === null) {
          metrics.minutesToFirstRebirth = activeMinutesElapsed;
        }
        state.erfenis += readiness.pending;
        state.erfenisClaimed += readiness.pending;
        state.rebirths++;
        state.lastRebirthMinute = minute;
        events.push({
          minute,
          kind: 'rebirth',
          label: `Rebirth #${state.rebirths}`,
          detail: `+${readiness.pending} erfenis`,
        });

        state.cash = 0;
        state.xp = 0;
        state.propertyId = STARTER_PROPERTY_ID;
        state.vehicleId = STARTER_VEHICLE_ID;
        state.ownedVehicles = new Set([STARTER_VEHICLE_ID]);
        state.upgrades = {};
        state.placements = [];
        state.vaultBalance = 0;
        state.accruedAtMinute = minute;
        reportedLevel = 1;

        spendErfenis(state, events);
        // Startkapitaal telt niet als opbrengst, net als op de server.
        state.cash += (state.legacy.legacy_headstart ?? 0) * 25_000;
      }
    }

    // --- dagelijkse momentopname ---
    if (minuteOfDay === 23 * 60) {
      const snapshotStats = statsFor(state);
      const active = activeIncomePerHour(state, snapshotStats, config);
      daily.push({
        day: Math.floor(minute / (24 * 60)) + 1,
        cash: Math.round(state.cash),
        incomePerHour: Math.round(snapshotStats.incomePerHour),
        activeIncomePerHour: Math.round(active),
        level: levelFromTotalXp(state.xp).level,
        propertyId: state.propertyId,
        placed: state.placements.length,
        slots: snapshotStats.slots,
        offlineInActiveMinutes: offlineWorthInMinutes(snapshotStats, active, config),
      });
    }
  }

  const finalStats = statsFor(state);
  const totalEarned = state.activeEarned + state.passiveEarned;

  metrics.finalLevel = levelFromTotalXp(state.xp).level;
  metrics.finalIncomePerHour = Math.round(finalStats.incomePerHour);
  metrics.activeIncomeShare = totalEarned > 0 ? state.activeEarned / totalEarned : 0;
  metrics.offlineInActiveMinutes = median(daily.map((d) => d.offlineInActiveMinutes));
  metrics.rebirths = state.rebirths;

  return { config, events, daily, metrics };
}

export const SIM_ECONOMY_KNOBS = { costGrowth: ECONOMY.costGrowth };
