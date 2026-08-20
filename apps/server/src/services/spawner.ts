import {
  CITY,
  DISTRICTS,
  DISTRICTS_BY_ID,
  findSpawnPoint,
  getItem,
  DEV_SPEED_ALLOWANCE,
  moveBudget,
  mulberry32,
  pickItemForDistrict,
  weightedPick,
  type DistrictId,
  type Rarity,
} from '@game/shared';
import { GameError } from '../lib/errors.js';
import { env } from '../env.js';
import { prisma } from '../lib/prisma.js';
import type { Tx } from './ledger.js';
import type { LoadedPlayer } from './player.js';

/** Basisaantal spawns per district; wordt geschaald met het spawnWeight. */
const SPAWN_TARGET_BASE = 45;
/** Het "hot zone"-district krijgt deze factor extra. */
const HOT_ZONE_MULTIPLIER = 2;
/** Minimale tijd tussen twee keer oprapen, tegen scripts. */
const COLLECT_COOLDOWN_MS = 350;
/** Extra marge op de oppakafstand, voor latency en interpolatie. */
const PICKUP_TOLERANCE_M = 3;
/** Extra marge op de snelheidscontrole. */
const SPEED_TOLERANCE_M = 30;
/**
 * De snelheidscontrole rekent met de tijd sinds de laatste positiemelding.
 * Die tijd wordt afgetopt, anders bouwt een speler die de app lang dicht heeft
 * een onbeperkt "teleportbudget" op.
 */
const MAX_POSITION_GAP_SECONDS = 30;

/** Elk uur is één district extra lucratief. */
export function hotDistrict(now: number): DistrictId {
  const hour = Math.floor(now / 3_600_000);
  const district = DISTRICTS[hour % DISTRICTS.length];
  return district?.id ?? 'oldTown';
}

function targetFor(districtId: DistrictId, now: number): number {
  const district = DISTRICTS_BY_ID[districtId];
  const hot = hotDistrict(now) === districtId ? HOT_ZONE_MULTIPLIER : 1;
  return Math.round(SPAWN_TARGET_BASE * district.spawnWeight * hot);
}

/**
 * Vult de stad bij: verwijdert verlopen spawns en maakt nieuwe aan tot elk
 * district op zijn streefaantal zit. De server bepaalt dus wát er ligt en
 * wáár — de client krijgt het alleen te zien.
 */
export async function ensureSpawns(now = new Date()): Promise<{ created: number; removed: number }> {
  const removed = await prisma.spawn.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { collectedAt: { not: null } }] },
  });

  let created = 0;
  const rand = mulberry32((now.getTime() / 1000) | 0);

  for (const district of DISTRICTS) {
    const target = targetFor(district.id, now.getTime());
    const active = await prisma.spawn.count({
      where: { districtId: district.id, collectedAt: null, expiresAt: { gt: now } },
    });
    const missing = target - active;
    if (missing <= 0) continue;

    const rows: {
      districtId: string;
      itemId: string;
      rarity: string;
      x: number;
      z: number;
      expiresAt: Date;
    }[] = [];

    for (let i = 0; i < missing; i++) {
      const point = findSpawnPoint(district.id, rand);
      if (!point) continue;
      const rarity = weightedPick<Rarity>(district.rarityWeights, rand());
      const item = pickItemForDistrict(district.id, rarity, rand());
      if (!item) continue;
      // Spreid de vervaltijd, anders verdwijnt alles tegelijk.
      const ttl = district.spawnTtlSeconds * (0.6 + rand() * 0.8);
      rows.push({
        districtId: district.id,
        itemId: item.id,
        rarity,
        x: point.x,
        z: point.z,
        expiresAt: new Date(now.getTime() + ttl * 1000),
      });
    }

    if (rows.length > 0) {
      const result = await prisma.spawn.createMany({ data: rows });
      created += result.count;
    }
  }

  return { created, removed: removed.count };
}

export interface NearbySpawn {
  id: string;
  itemId: string;
  rarity: string;
  x: number;
  z: number;
  expiresAt: number;
  districtId: string;
}

/** Alle actieve spawns binnen `radius` meter van een punt. */
export async function nearbySpawns(
  x: number,
  z: number,
  radius: number,
  now = new Date(),
): Promise<NearbySpawn[]> {
  const rows = await prisma.spawn.findMany({
    where: {
      collectedAt: null,
      expiresAt: { gt: now },
      x: { gte: x - radius, lte: x + radius },
      z: { gte: z - radius, lte: z + radius },
    },
    take: 300,
    orderBy: { createdAt: 'asc' },
  });

  const radiusSq = radius * radius;
  return rows
    .filter((row) => {
      const dx = row.x - x;
      const dz = row.z - z;
      return dx * dx + dz * dz <= radiusSq;
    })
    .map((row) => ({
      id: row.id,
      itemId: row.itemId,
      rarity: row.rarity,
      x: row.x,
      z: row.z,
      expiresAt: row.expiresAt.getTime(),
      districtId: row.districtId,
    }));
}

export interface CollectOutcome {
  itemId: string;
  rarity: Rarity;
  xpGained: number;
}

/**
 * Pakt een spawn op. De server controleert alles wat de client beweert:
 * bestaat de spawn nog, staat de speler er echt naast, is hij daar in de
 * beschikbare tijd kunnen komen, en gaat hij niet te snel achter elkaar.
 */
export async function collectSpawn(
  tx: Tx,
  loaded: LoadedPlayer,
  spawnId: string,
  claimedX: number,
  claimedZ: number,
  now: Date,
): Promise<CollectOutcome> {
  const { player, stats } = loaded;

  // Volgorde is bewust: eerst de goedkope, meest voorkomende afwijzingen met
  // een duidelijke oorzaak, daarna pas de heuristieken. Anders krijgt een
  // speler "positie klopt niet" terwijl het item gewoon al weg was.
  const spawn = await tx.spawn.findUnique({ where: { id: spawnId } });
  if (!spawn || spawn.collectedAt !== null || spawn.expiresAt <= now) {
    throw new GameError('Dit item ligt er niet meer.', 410, 'spawn_gone');
  }

  const reach = stats.pickupRadius + PICKUP_TOLERANCE_M;
  if (Math.hypot(spawn.x - claimedX, spawn.z - claimedZ) > reach) {
    throw new GameError('Je staat te ver weg.', 400, 'too_far');
  }

  const sinceLastCollect = now.getTime() - player.lastCollectAt.getTime();
  if (sinceLastCollect < COLLECT_COOLDOWN_MS) {
    throw new GameError('Rustig aan.', 429, 'collect_too_fast');
  }

  // Snelheidscontrole: kan de speler hier in de verstreken tijd zijn gekomen?
  const sincePosition = Math.min(
    MAX_POSITION_GAP_SECONDS,
    Math.max(0, now.getTime() - player.positionAt.getTime()) / 1000,
  );
  const maxDistance = moveBudget(
    stats.moveSpeed,
    sincePosition,
    SPEED_TOLERANCE_M,
    env.devTools ? DEV_SPEED_ALLOWANCE : undefined,
  );
  const travelled = Math.hypot(claimedX - player.x, claimedZ - player.z);
  if (travelled > maxDistance) {
    throw new GameError('Je bewoog te snel.', 400, 'position_rejected');
  }

  // Voorwaardelijke update: twee gelijktijdige verzoeken kunnen niet allebei
  // dezelfde spawn oppakken.
  const claimed = await tx.spawn.updateMany({
    where: { id: spawnId, collectedAt: null },
    data: { collectedAt: now, collectedById: player.id },
  });
  if (claimed.count === 0) {
    throw new GameError('Iemand was je voor.', 410, 'spawn_gone');
  }

  await tx.player.update({
    where: { id: player.id },
    data: { lastCollectAt: now, x: claimedX, z: claimedZ, positionAt: now },
  });

  const item = getItem(spawn.itemId);
  return { itemId: item.id, rarity: item.rarity, xpGained: 0 };
}

/** Handig voor de kaart in de app: hoeveel ligt er per district. */
export async function spawnCounts(now = new Date()): Promise<Record<string, number>> {
  const rows = await prisma.spawn.groupBy({
    by: ['districtId'],
    where: { collectedAt: null, expiresAt: { gt: now } },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const district of DISTRICTS) counts[district.id] = 0;
  for (const row of rows) counts[row.districtId] = row._count._all;
  return counts;
}

export const SPAWN_CONSTANTS = {
  SPAWN_TARGET_BASE,
  HOT_ZONE_MULTIPLIER,
  COLLECT_COOLDOWN_MS,
  PICKUP_TOLERANCE_M,
  MAX_POSITION_GAP_SECONDS,
  CITY_CELL_SIZE: CITY.cellSize,
};
