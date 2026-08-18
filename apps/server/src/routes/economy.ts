import {
  RARITIES,
  dayIndexFor,
  getItem,
  getProperty,
  marketMultiplier,
  placementSchema,
  sellAllSchema,
  sellItemsSchema,
  stackValue,
  type Rarity,
} from '@game/shared';
import type { FastifyInstance } from 'fastify';
import { authenticate, playerIdOf } from '../lib/auth.js';
import { GameError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { grant } from '../services/ledger.js';
import {
  addItem,
  loadPlayer,
  removeItem,
  settleVault,
  toPlayerStateDto,
} from '../services/player.js';
import { trackQuest } from '../services/quests.js';

export async function economyRoutes(app: FastifyInstance): Promise<void> {
  /** De actuele marktprijzen; schommelen per dag per categorie. */
  app.get('/economy/market', { preHandler: authenticate }, async () => {
    const day = dayIndexFor(Date.now());
    const categories = ['valuable', 'material', 'part', 'decor', 'cosmetic', 'token'] as const;
    return {
      day,
      multipliers: Object.fromEntries(
        categories.map((category) => [category, marketMultiplier(category, day)]),
      ),
      serverTime: Date.now(),
    };
  });

  /** Haalt het opgehoopte passieve inkomen uit de kluis. */
  app.post('/economy/vault/collect', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, loaded, now);

      const amount = Math.floor(Number(loaded.player.vaultBalance));
      if (amount <= 0) {
        throw new GameError('Er staat nog niets in je kluis.', 400, 'vault_empty');
      }

      await tx.player.update({ where: { id: playerId }, data: { vaultBalance: BigInt(0) } });
      const balance = await grant(tx, playerId, 'cash', amount, 'vault_collect');
      await trackQuest(tx, playerId, loaded.player.seed, now, 'collect_income', 1);

      const refreshed = await loadPlayer(tx, playerId);
      return {
        collected: amount,
        cash: balance,
        state: toPlayerStateDto(refreshed, { ...accrual, vaultBalance: 0 }, now),
      };
    });
  });

  /** Verkoopt een aantal exemplaren van één item. */
  app.post('/economy/sell', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = sellItemsSchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      const item = getItem(body.itemId);
      const market = marketMultiplier(item.category, dayIndexFor(now.getTime()));
      const value = stackValue(item.id, body.quantity, market);
      if (value <= 0) {
        throw new GameError('Dit item kun je niet verkopen.', 400, 'not_sellable');
      }

      await removeItem(tx, playerId, item.id, body.quantity);
      const cash = await grant(tx, playerId, 'cash', value, 'sell', {
        itemId: item.id,
        quantity: body.quantity,
        market,
      });
      await trackQuest(tx, playerId, loaded.player.seed, now, 'sell_value', value);

      const refreshed = await loadPlayer(tx, playerId);
      return {
        earned: value,
        cash,
        inventory: refreshed.inventory,
        serverTime: now.getTime(),
      };
    });
  });

  /** Verkoopt in één klap alles tot en met een bepaalde zeldzaamheid. */
  app.post('/economy/sell-all', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = sellAllSchema.parse(request.body ?? {});
    const now = new Date();
    const maxIndex = RARITIES.indexOf(body.maxRarity as Rarity);

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      const day = dayIndexFor(now.getTime());

      let total = 0;
      let sold = 0;
      for (const entry of loaded.inventory) {
        const item = getItem(entry.itemId);
        if (RARITIES.indexOf(item.rarity) > maxIndex) continue;
        if (item.baseValue <= 0) continue;
        const value = stackValue(item.id, entry.quantity, marketMultiplier(item.category, day));
        if (value <= 0) continue;
        await removeItem(tx, playerId, item.id, entry.quantity);
        total += value;
        sold += entry.quantity;
      }

      if (total <= 0) {
        throw new GameError('Niets te verkopen in deze categorie.', 400, 'nothing_to_sell');
      }

      const cash = await grant(tx, playerId, 'cash', total, 'sell_all', { maxRarity: body.maxRarity });
      await trackQuest(tx, playerId, loaded.player.seed, now, 'sell_value', total);

      const refreshed = await loadPlayer(tx, playerId);
      return { earned: total, itemsSold: sold, cash, inventory: refreshed.inventory };
    });
  });

  /** Plaatst een item in je base; alleen geplaatste items leveren inkomen op. */
  app.post('/base/place', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = placementSchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      // Eerst afrekenen tegen de oude rate, dan pas de rate verhogen.
      await settleVault(tx, loaded, now);

      const item = getItem(body.itemId);
      if (!item.incomePerHour && !item.flex) {
        throw new GameError('Dit item kun je niet plaatsen.', 400, 'not_placeable');
      }

      const property = getProperty(loaded.player.propertyId);
      const used = loaded.placements.reduce((sum, p) => sum + p.quantity, 0);
      if (used + body.quantity > property.slots) {
        throw new GameError(
          `Je base heeft maar ${property.slots} plekken. Koop een grotere woning.`,
          400,
          'no_slots',
        );
      }

      await removeItem(tx, playerId, item.id, body.quantity);
      await tx.placement.upsert({
        where: { playerId_itemId: { playerId, itemId: item.id } },
        create: { playerId, itemId: item.id, quantity: body.quantity },
        update: { quantity: { increment: body.quantity } },
      });
      await trackQuest(tx, playerId, loaded.player.seed, now, 'place_items', body.quantity);

      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return toPlayerStateDto(refreshed, accrual, now);
    });
  });

  /** Haalt een item weer uit je base terug in je rugzak. */
  app.post('/base/unplace', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = placementSchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      await settleVault(tx, loaded, now);

      const affected = await tx.placement.updateMany({
        where: { playerId, itemId: body.itemId, quantity: { gte: body.quantity } },
        data: { quantity: { decrement: body.quantity } },
      });
      if (affected.count === 0) {
        throw new GameError('Dit item staat niet in je base.', 400, 'not_placed');
      }
      await addItem(tx, playerId, body.itemId, body.quantity);

      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return toPlayerStateDto(refreshed, accrual, now);
    });
  });

  /** Grootboek: de laatste mutaties, handig om te zien waar geld vandaan komt. */
  app.get('/economy/ledger', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const rows = await prisma.transaction.findMany({
      where: { playerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      entries: rows.map((row) => ({
        id: row.id,
        currency: row.currency,
        amount: Number(row.amount),
        balance: Number(row.balance),
        reason: row.reason,
        createdAt: row.createdAt.getTime(),
      })),
    };
  });

}
