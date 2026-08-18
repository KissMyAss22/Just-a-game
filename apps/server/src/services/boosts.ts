import { BOOSTS_BY_ID } from '@game/shared';
import { GameError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import type { Tx } from './ledger.js';

/**
 * Kent een boost toe. Heb je hem al, dan wordt de looptijd verlengd in plaats
 * van overschreven — anders zou een tweede aankoop de eerste weggooien.
 */
export async function grantBoost(
  tx: Tx,
  playerId: string,
  boostId: string,
  hours: number,
  now: Date,
): Promise<Date> {
  const boost = BOOSTS_BY_ID[boostId];
  if (!boost) throw new GameError('Onbekende boost.', 404, 'boost_not_found');

  const existing = await tx.playerBoost.findFirst({
    where: { playerId, boostId, expiresAt: { gt: now } },
    orderBy: { expiresAt: 'desc' },
  });

  const from = existing ? existing.expiresAt : now;
  const expiresAt = new Date(from.getTime() + hours * 3_600_000);

  if (existing) {
    await tx.playerBoost.update({ where: { id: existing.id }, data: { expiresAt } });
  } else {
    await tx.playerBoost.create({ data: { playerId, boostId, expiresAt } });
  }
  return expiresAt;
}

/** Ruimt verlopen boosts op. Draait mee op het ritme van de spawner. */
export async function pruneExpiredBoosts(now = new Date()): Promise<number> {
  const result = await prisma.playerBoost.deleteMany({ where: { expiresAt: { lte: now } } });
  return result.count;
}
