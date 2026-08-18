import {
  accrualCapacity,
  accrueIncome,
  afterManagerFee,
  computeStats,
  levelFromTotalXp,
  normalizeAppearance,
  xpForNextLevel,
  type ActiveBoostDto,
  type Appearance,
  type PlayerStats,
  type PlayerStateDto,
} from '@game/shared';
import type { Player } from '@prisma/client';
import { GameError } from '../lib/errors.js';
import { grant, type Tx } from './ledger.js';

export interface LoadedPlayer {
  player: Player;
  upgrades: Record<string, number>;
  placements: { itemId: string; quantity: number }[];
  inventory: { itemId: string; quantity: number }[];
  ownedVehicleIds: string[];
  activeBoosts: ActiveBoostDto[];
  appearance: Appearance;
  stats: PlayerStats;
}

/** Laadt de speler met alles wat nodig is om zijn statistieken te berekenen. */
export async function loadPlayer(tx: Tx, playerId: string): Promise<LoadedPlayer> {
  const now = new Date();
  const player = await tx.player.findUnique({
    where: { id: playerId },
    include: {
      upgrades: true,
      placements: true,
      inventory: { where: { quantity: { gt: 0 } } },
      vehicles: true,
      boosts: { where: { expiresAt: { gt: now } } },
    },
  });
  if (!player) throw new GameError('Speler niet gevonden.', 404, 'player_not_found');

  const upgrades: Record<string, number> = {};
  for (const upgrade of player.upgrades) upgrades[upgrade.upgradeId] = upgrade.level;

  const placements = player.placements
    .filter((p) => p.quantity > 0)
    .map((p) => ({ itemId: p.itemId, quantity: p.quantity }));
  const inventory = player.inventory.map((i) => ({ itemId: i.itemId, quantity: i.quantity }));
  const ownedVehicleIds = player.vehicles.map((v) => v.vehicleId);
  if (!ownedVehicleIds.includes(player.vehicleId)) ownedVehicleIds.push(player.vehicleId);

  const activeBoosts: ActiveBoostDto[] = player.boosts.map((boost) => ({
    boostId: boost.boostId,
    expiresAt: boost.expiresAt.getTime(),
  }));

  const stats = computeStats({
    propertyId: player.propertyId,
    vehicleId: player.vehicleId,
    upgrades,
    placements,
    activeBoostIds: activeBoosts.map((b) => b.boostId),
  });

  return {
    player,
    upgrades,
    placements,
    inventory,
    ownedVehicleIds,
    activeBoosts,
    appearance: normalizeAppearance(player.appearance),
    stats,
  };
}

/**
 * Schrijft het passieve inkomen bij tot `now` en slaat dat op.
 *
 * Dit moet gebeuren vóór élke wijziging die het inkomen beïnvloedt (upgrade
 * kopen, item plaatsen, woning kopen). Anders zou de nieuwe, hogere rate met
 * terugwerkende kracht over de afgelopen uren worden toegepast.
 */
export interface SettleResult extends ReturnType<typeof accrueIncome> {
  /** Wat de manager automatisch heeft geïnd, na commissie. */
  managerCollected: number;
  /** Wat de manager daarvoor inhield. */
  managerFeePaid: number;
}

export async function settleVault(
  tx: Tx,
  loaded: LoadedPlayer,
  now: Date,
): Promise<SettleResult> {
  const result = accrueIncome({
    ratePerHour: loaded.stats.incomePerHour,
    accruedAt: loaded.player.accruedAt.getTime(),
    now: now.getTime(),
    offlineCapHours: loaded.stats.offlineCapHours,
    vaultBalance: Number(loaded.player.vaultBalance),
    // Met een manager is er geen bovengrens: de kluis wordt continu geleegd.
    vaultCapacity: accrualCapacity(loaded.stats),
  });

  const nextAccruedAt = new Date(Math.round(result.accruedAt));
  if (result.earned > 0 || nextAccruedAt.getTime() !== loaded.player.accruedAt.getTime()) {
    loaded.player = await tx.player.update({
      where: { id: loaded.player.id },
      data: {
        vaultBalance: BigInt(Math.floor(result.vaultBalance)),
        accruedAt: nextAccruedAt,
      },
    });
  }

  let managerCollected = 0;
  let managerFeePaid = 0;

  // De manager int meteen door, zodat er niets verloren gaat aan een volle
  // kluis — maar hij houdt zijn commissie in.
  if (loaded.stats.autoCollect) {
    const gross = Math.floor(result.vaultBalance);
    if (gross > 0) {
      const { net, fee } = afterManagerFee(gross, loaded.stats.managerFee);
      loaded.player = await tx.player.update({
        where: { id: loaded.player.id },
        data: { vaultBalance: BigInt(0) },
      });
      const balance = await grant(tx, loaded.player.id, 'cash', net, 'manager_collect', {
        gross,
        fee,
      });
      loaded.player.cash = BigInt(balance);
      result.vaultBalance = 0;
      managerCollected = net;
      managerFeePaid = fee;
    }
  }

  return { ...result, managerCollected, managerFeePaid };
}

/** Totaal aantal items in de rugzak. */
export function inventoryCount(inventory: { quantity: number }[]): number {
  return inventory.reduce((sum, entry) => sum + entry.quantity, 0);
}

export async function addItem(
  tx: Tx,
  playerId: string,
  itemId: string,
  quantity: number,
): Promise<void> {
  if (quantity <= 0) return;
  await tx.inventoryItem.upsert({
    where: { playerId_itemId: { playerId, itemId } },
    create: { playerId, itemId, quantity },
    update: { quantity: { increment: quantity } },
  });
}

/** Haalt items uit de rugzak; gooit een fout als je ze niet hebt. */
export async function removeItem(
  tx: Tx,
  playerId: string,
  itemId: string,
  quantity: number,
): Promise<void> {
  if (quantity <= 0) return;
  const affected = await tx.inventoryItem.updateMany({
    where: { playerId, itemId, quantity: { gte: quantity } },
    data: { quantity: { decrement: quantity } },
  });
  if (affected.count === 0) {
    throw new GameError('Je hebt dit item niet (genoeg).', 400, 'item_not_owned');
  }
}

export interface XpResult {
  level: number;
  xp: number;
  levelsGained: number;
  rewards: { cash: number; gems: number };
}

/** Beloning bij het bereiken van een nieuw level. */
function levelReward(level: number): { cash: number; gems: number } {
  return {
    cash: Math.round(250 * Math.pow(1.32, level - 1)),
    gems: level % 5 === 0 ? 25 : 5,
  };
}

/** Kent XP toe en handelt eventuele level-ups af, inclusief beloningen. */
export async function grantXp(
  tx: Tx,
  playerId: string,
  currentXp: number,
  currentLevel: number,
  amount: number,
): Promise<XpResult> {
  const gained = Math.max(0, Math.round(amount));
  const totalXp = currentXp + gained;
  const progress = levelFromTotalXp(totalXp);
  const levelsGained = Math.max(0, progress.level - currentLevel);

  const rewards = { cash: 0, gems: 0 };
  for (let level = currentLevel + 1; level <= progress.level; level++) {
    const reward = levelReward(level);
    rewards.cash += reward.cash;
    rewards.gems += reward.gems;
  }

  await tx.player.update({
    where: { id: playerId },
    data: { xp: totalXp, level: progress.level },
  });

  if (rewards.cash > 0) {
    await grant(tx, playerId, 'cash', rewards.cash, 'level_up', { level: progress.level });
  }
  if (rewards.gems > 0) {
    await grant(tx, playerId, 'gems', rewards.gems, 'level_up', { level: progress.level });
  }

  return { level: progress.level, xp: totalXp, levelsGained, rewards };
}

/** Zet alles om naar het formaat dat de app verwacht. */
export function toPlayerStateDto(
  loaded: LoadedPlayer,
  accrual: ReturnType<typeof accrueIncome>,
  now: Date,
): PlayerStateDto {
  const { player, stats } = loaded;
  const progress = levelFromTotalXp(player.xp);
  return {
    player: {
      id: player.id,
      displayName: player.displayName,
      level: progress.level,
      xp: player.xp,
      xpIntoLevel: progress.xpIntoLevel,
      xpForNext: xpForNextLevel(progress.level),
      cash: Number(player.cash),
      gems: player.gems,
      propertyId: player.propertyId,
      vehicleId: player.vehicleId,
      ownedVehicleIds: loaded.ownedVehicleIds,
      upgrades: loaded.upgrades,
      appearance: loaded.appearance,
      x: player.x,
      z: player.z,
    },
    vault: {
      balance: Math.floor(accrual.vaultBalance),
      capacity: stats.vaultCapacity,
      accruedAt: Math.round(accrual.accruedAt),
      ratePerHour: stats.incomePerHour,
      secondsUntilFull: Number.isFinite(accrual.secondsUntilFull)
        ? Math.round(accrual.secondsUntilFull)
        : -1,
      cappedByTime: accrual.cappedByTime,
    },
    stats: {
      incomePerHour: stats.incomePerHour,
      baseIncomePerHour: stats.baseIncomePerHour,
      flexScore: stats.flexScore,
      flexMultiplier: stats.flexMultiplier,
      vaultCapacity: stats.vaultCapacity,
      offlineCapHours: stats.offlineCapHours,
      inventorySlots: stats.inventorySlots,
      moveSpeed: stats.moveSpeed,
      pickupRadius: stats.pickupRadius,
      autoCollect: stats.autoCollect,
      managerFee: stats.managerFee,
      doubleDropChance: stats.doubleDropChance,
    },
    inventory: loaded.inventory,
    placements: loaded.placements,
    activeBoosts: loaded.activeBoosts,
    serverTime: now.getTime(),
  };
}
