import type { Prisma } from '@prisma/client';
import { GameError } from '../lib/errors.js';

export type Tx = Prisma.TransactionClient;

const SHORTFALL_MESSAGE = {
  cash: 'Je hebt niet genoeg geld.',
  gems: 'Je hebt niet genoeg gems.',
  erfenis: 'Je hebt niet genoeg erfenis.',
} as const;

const SHORTFALL_CODE = {
  cash: 'not_enough_cash',
  gems: 'not_enough_gems',
  erfenis: 'not_enough_erfenis',
} as const;

function balanceOf(
  row: { cash: bigint; gems: number; erfenis: number },
  currency: Currency,
): bigint {
  if (currency === 'cash') return row.cash;
  if (currency === 'gems') return BigInt(row.gems);
  return BigInt(row.erfenis);
}
export type Currency = 'cash' | 'gems' | 'erfenis';

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
  /**
   * Telt deze bijschrijving mee voor je levenslange opbrengst? Startkapitaal
   * uit een rebirth niet: anders zou dat voordeel zichzelf voeden en elke
   * volgende rebirth goedkoper maken.
   */
  countsAsEarnings = true,
): Promise<number> {
  const value = Math.floor(amount);
  if (value <= 0) {
    const current = await tx.player.findUniqueOrThrow({
      where: { id: playerId },
      select: { cash: true, gems: true, erfenis: true },
    });
    return Number(balanceOf(current, currency));
  }

  const updated = await tx.player.update({
    where: { id: playerId },
    data:
      currency === 'cash'
        ? // Dit is de enige plek waar cash bijgeschreven wordt, dus ook de
          // enige plek waar de levenslange opbrengst meegroeit.
          {
            cash: { increment: BigInt(value) },
            ...(countsAsEarnings ? { lifetimeEarned: { increment: BigInt(value) } } : {}),
          }
        : currency === 'gems'
          ? { gems: { increment: value } }
          : { erfenis: { increment: value } },
    select: { cash: true, gems: true, erfenis: true },
  });
  const balance = balanceOf(updated, currency);
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
      select: { cash: true, gems: true, erfenis: true },
    });
    return Number(balanceOf(current, currency));
  }

  const affected = await tx.player.updateMany({
    where:
      currency === 'cash'
        ? { id: playerId, cash: { gte: BigInt(value) } }
        : currency === 'gems'
          ? { id: playerId, gems: { gte: value } }
          : { id: playerId, erfenis: { gte: value } },
    data:
      currency === 'cash'
        ? { cash: { decrement: BigInt(value) } }
        : currency === 'gems'
          ? { gems: { decrement: value } }
          : { erfenis: { decrement: value } },
  });

  if (affected.count === 0) {
    throw new GameError(SHORTFALL_MESSAGE[currency], 400, SHORTFALL_CODE[currency]);
  }

  const updated = await tx.player.findUniqueOrThrow({
    where: { id: playerId },
    select: { cash: true, gems: true, erfenis: true },
  });
  const balance = balanceOf(updated, currency);
  await record(tx, playerId, currency, BigInt(-value), balance, reason, meta);
  return Number(balance);
}
