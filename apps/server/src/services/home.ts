import {
  checkPlacement,
  findFreeSpot,
  floorPlanFor,
  type PlacedItem,
} from '@game/shared';
import { prisma } from '../lib/prisma.js';
import type { Tx } from './ledger.js';
import { addItem } from './player.js';

export interface RepairResult {
  moved: number;
  returned: number;
}

/**
 * Zet inrichting die niet (meer) klopt weer goed.
 *
 * Nodig na de migratie van "aantal per soort" naar echte plekken — daar
 * kwam alles op (0,0) terecht, omdat alleen hier bekend is welke plattegrond
 * bij welke woning hoort. Past iets nergens meer, dan gaat het terug naar de
 * rugzak in plaats van te verdwijnen.
 */
export async function repairPlacements(tx: Tx, playerId: string): Promise<RepairResult> {
  const player = await tx.player.findUnique({
    where: { id: playerId },
    select: { propertyId: true, placements: { orderBy: { id: 'asc' } } },
  });
  if (!player) return { moved: 0, returned: 0 };

  const plan = floorPlanFor(player.propertyId);
  const keep: PlacedItem[] = [];
  let moved = 0;
  let returned = 0;

  for (const row of player.placements) {
    const current: PlacedItem = {
      id: row.id,
      itemId: row.itemId,
      x: row.x,
      z: row.z,
      rotation: row.rotation,
    };

    if (checkPlacement(plan, keep, current.itemId, current.x, current.z, current.rotation).ok) {
      keep.push(current);
      continue;
    }

    const spot = findFreeSpot(plan, keep, current.itemId);
    if (spot) {
      await tx.placement.update({
        where: { id: row.id },
        data: { x: spot.x, z: spot.z, rotation: spot.rotation },
      });
      keep.push({ ...current, ...spot });
      moved++;
    } else {
      await tx.placement.delete({ where: { id: row.id } });
      await addItem(tx, playerId, row.itemId, 1);
      returned++;
    }
  }

  return { moved, returned };
}

/** Loopt alle spelers na. Wordt gebruikt door het seed-script na een migratie. */
export async function repairAllPlacements(): Promise<RepairResult & { players: number }> {
  const players = await prisma.player.findMany({ select: { id: true } });
  const total: RepairResult = { moved: 0, returned: 0 };

  for (const player of players) {
    const result = await prisma.$transaction((tx) => repairPlacements(tx, player.id));
    total.moved += result.moved;
    total.returned += result.returned;
  }

  return { ...total, players: players.length };
}
