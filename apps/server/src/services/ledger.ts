import type { Prisma } from '@prisma/client';
import { GameError } from '../lib/errors.js';

export type Tx = Prisma.TransactionClient;
export type Currency = 'cash' | 'gems';

/**
 * Het grootboek. Elke mutatie van cash of gems loopt hierlangs, zodat er van
 * elke munt een spoor is. Dat is bij een economie geen luxe: zonder grootboek
 * is een duplicatie-bug niet te vinden en kun je niemand compenseren.
 */
async function record(
  tx: Tx,
  playerId: string,
  currency: Currency,
  amount: bigint,
  balance: bigint,
  reason: string,
  meta?: Prisma.InputJsonValue,
): Promise<void> {
  await tx.transaction.create({
    data: { playerId, currency, amount, balance, reason, meta },
  });
}

/** Schrijft valuta bij. `amount` moet positief zijn. */
export async function grant(
  tx: Tx,
  playerId: string,
  currency: Currency,
  amount: number,
  reason: string,
  meta?: Prisma.InputJsonValue,
): Promise<number> {
  const value = Math.floor(amount);
  if (value <= 0) {
    const current = await tx.player.findUniqueOrThrow({
      where: { id: playerId },
      select: { cash: true, gems: true },
    });
    return currency === 'cash' ? Number(current.cash) : current.gems;
  }

  const updated = await tx.player.update({
    where: { id: playerId },
    data:
      currency === 'cash'
        ? { cash: { increment: BigInt(value) } }
        : { gems: { increment: value } },
    select: { cash: true, gems: true },
  });
  const balance = currency === 'cash' ? updated.cash : BigInt(updated.gems);
  await record(tx, playerId, currency, BigInt(value), balance, reason, meta);
  return Number(balance);
}

/**
 * Schrijft valuta af. Gebruikt een voorwaardelijke update, zodat twee
 * gelijktijdige aankopen niet allebei kunnen slagen bij te weinig saldo.
 */
export async function spend(
  tx: Tx,
  playerId: string,
  currency: Currency,
  amount: number,
  reason: string,
  meta?: Prisma.InputJsonValue,
): Promise<number> {
  const value = Math.floor(amount);
  if (value < 0) throw new GameError('Ongeldig bedrag.', 400, 'invalid_amount');
  if (value === 0) {
    const current = await tx.player.findUniqueOrThrow({
      where: { id: playerId },
      select: { cash: true, gems: true },
    });
    return currency === 'cash' ? Number(current.cash) : current.gems;
  }

  const affected = await tx.player.updateMany({
    where:
      currency === 'cash'
        ? { id: playerId, cash: { gte: BigInt(value) } }
        : { id: playerId, gems: { gte: value } },
    data:
      currency === 'cash'
        ? { cash: { decrement: BigInt(value) } }
        : { gems: { decrement: value } },
  });

  if (affected.count === 0) {
    throw new GameError(
      currency === 'cash' ? 'Je hebt niet genoeg geld.' : 'Je hebt niet genoeg gems.',
      400,
      currency === 'cash' ? 'not_enough_cash' : 'not_enough_gems',
    );
  }

  const updated = await tx.player.findUniqueOrThrow({
    where: { id: playerId },
    select: { cash: true, gems: true },
  });
  const balance = currency === 'cash' ? updated.cash : BigInt(updated.gems);
  await record(tx, playerId, currency, BigInt(-value), balance, reason, meta);
  return Number(balance);
}
