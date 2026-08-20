import {
  PLACEMENT_PROBLEM_MESSAGE,
  RARITIES,
  SHOP_REACH_TOLERANCE,
  atShop,
  nearestShop,
  checkPlacement,
  dayIndexFor,
  discardItemsSchema,
  findFreeSpot,
  floorPlanFor,
  getItem,
  marketMultiplier,
  moveItemSchema,
  placeItemSchema,
  sellAllSchema,
  sellItemsSchema,
  stackValue,
  storeItemSchema,
  swapItemSchema,
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

/**
 * Sta je bij een pandjeshuis?
 *
 * Toetst tegen de positie die de server zélf heeft opgeslagen, niet tegen iets
 * wat de client meestuurt. Die kolom wordt bijgehouden door /player/position,
 * waar hij al door de snelheidscontrole gaat en op begaanbaar terrein wordt
 * gezet. Daarmee is de winkel een echte regel: je kunt niet beweren dat je er
 * staat, je moet er naartoe lopen.
 *
 * De marge zit erop omdat die opgeslagen positie altijd een fractie achterloopt
 * op waar je op je scherm staat; zonder marge krijg je een weigering terwijl je
 * de verkoper aankijkt.
 */
function requireShop(player: { x: number; z: number }): void {
  if (atShop(player.x, player.z, SHOP_REACH_TOLERANCE)) return;
  const near = nearestShop(player.x, player.z);
  throw new GameError(
    near
      ? `Hier koopt niemand iets van je. ${near.spot.name} is ${Math.round(near.distance)} meter verderop.`
      : 'Hier koopt niemand iets van je.',
    400,
    'not_at_shop',
  );
}

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
      requireShop(loaded.player);
      const item = getItem(body.itemId);
      const market = marketMultiplier(item.category, dayIndexFor(now.getTime()));
      const value = stackValue(item.id, body.quantity, market * loaded.stats.sellMultiplier);
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
      requireShop(loaded.player);
      const day = dayIndexFor(now.getTime());

      let total = 0;
      let sold = 0;
      for (const entry of loaded.inventory) {
        const item = getItem(entry.itemId);
        if (RARITIES.indexOf(item.rarity) > maxIndex) continue;
        if (item.baseValue <= 0) continue;
        const value = stackValue(
          item.id,
          entry.quantity,
          marketMultiplier(item.category, day) * loaded.stats.sellMultiplier,
        );
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

  /**
   * Weggooien: uit je rugzak, en verder niets.
   *
   * Er komt geen cash tegenover te staan, dus dit raakt het grootboek niet.
   * De reden dat dit bestaat: als je woning vol zit en je rugzak ook, dan is
   * er zonder deze route geen enkele manier om plek te maken voor iets beters.
   */
  app.post('/economy/discard', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = discardItemsSchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      // Gooit een fout als je ze niet (genoeg) hebt, dus de transactie draait
      // vanzelf terug bij een verzoek dat niet klopt.
      await removeItem(tx, playerId, getItem(body.itemId).id, body.quantity);

      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return {
        discarded: body.quantity,
        state: toPlayerStateDto(refreshed, accrual, now),
      };
    });
  });

  /**
   * Zet een voorwerp op een echte plek in je woning.
   *
   * Geeft de app geen plek mee, dan zoekt de server de eerste vrije plek — zo
   * blijft de knop "plaats" op het base-scherm werken zonder dat je de kamer
   * in hoeft.
   */
  app.post('/base/place', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = placeItemSchema.partial({ x: true, z: true }).parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      // Eerst afrekenen tegen de oude rate, dan pas de rate verhogen.
      await settleVault(tx, loaded, now);

      const item = getItem(body.itemId);
      const plan = floorPlanFor(loaded.player.propertyId);

      let spot: { x: number; z: number; rotation: number } | null;
      if (body.x === undefined || body.z === undefined) {
        spot = findFreeSpot(plan, loaded.placements, item.id);
        if (!spot) {
          throw new GameError(
            'Er is geen plek meer vrij in je woning. Koop iets groters of berg iets op.',
            400,
            'no_space',
          );
        }
      } else {
        spot = { x: body.x, z: body.z, rotation: body.rotation };
        const check = checkPlacement(
          plan,
          loaded.placements,
          item.id,
          spot.x,
          spot.z,
          spot.rotation,
        );
        if (!check.ok) {
          throw new GameError(PLACEMENT_PROBLEM_MESSAGE[check.problem], 400, check.problem);
        }
      }

      await removeItem(tx, playerId, item.id, 1);
      await tx.placement.create({
        data: { playerId, itemId: item.id, x: spot.x, z: spot.z, rotation: spot.rotation },
      });
      await trackQuest(tx, playerId, loaded.player.seed, now, 'place_items', 1);

      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return toPlayerStateDto(refreshed, accrual, now);
    });
  });

  /** Verschuift of draait iets dat al staat. */
  app.post('/base/move', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = moveItemSchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      const current = loaded.placements.find((p) => p.id === body.placementId);
      if (!current) throw new GameError('Dat staat niet in je woning.', 404, 'not_placed');

      const plan = floorPlanFor(loaded.player.propertyId);
      const check = checkPlacement(
        plan,
        loaded.placements,
        current.itemId,
        body.x,
        body.z,
        body.rotation,
        // Zichzelf niet meetellen, anders botst hij met zijn eigen oude plek.
        current.id,
      );
      if (!check.ok) {
        throw new GameError(PLACEMENT_PROBLEM_MESSAGE[check.problem], 400, check.problem);
      }

      await tx.placement.update({
        where: { id: current.id },
        data: { x: body.x, z: body.z, rotation: body.rotation },
      });

      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return toPlayerStateDto(refreshed, accrual, now);
    });
  });

  /** Bergt een voorwerp op: terug in je rugzak. */
  app.post('/base/store', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = storeItemSchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      // Afrekenen vóór het inkomen omlaag gaat.
      await settleVault(tx, loaded, now);

      const removed = await tx.placement.deleteMany({
        where: { id: body.placementId, playerId },
      });
      if (removed.count === 0) {
        throw new GameError('Dat staat niet in je woning.', 404, 'not_placed');
      }

      const current = loaded.placements.find((p) => p.id === body.placementId);
      if (current) await addItem(tx, playerId, current.itemId, 1);

      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return toPlayerStateDto(refreshed, accrual, now);
    });
  });

  /**
   * Wisselen: wat er staat gaat terug in je rugzak en het nieuwe voorwerp komt
   * op precies dezelfde plek te staan. Eén transactie, dus je kunt hier niet
   * halverwege stranden met een lege plek of een verdwenen voorwerp.
   */
  app.post('/base/swap', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = swapItemSchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      await settleVault(tx, loaded, now);

      const current = loaded.placements.find((p) => p.id === body.placementId);
      if (!current) throw new GameError('Dat staat niet in je woning.', 404, 'not_placed');
      if (current.itemId === body.itemId) {
        throw new GameError('Dat staat er al.', 400, 'already_placed');
      }

      const item = getItem(body.itemId);
      const plan = floorPlanFor(loaded.player.propertyId);
      // Controleren of het nieuwe voorwerp op die plek past, met het oude
      // eruit gedacht: het mag groter zijn dan wat er stond, maar niet zo
      // groot dat het de buren raakt.
      const check = checkPlacement(
        plan,
        loaded.placements,
        item.id,
        current.x,
        current.z,
        current.rotation,
        current.id,
      );
      if (!check.ok) {
        throw new GameError(PLACEMENT_PROBLEM_MESSAGE[check.problem], 400, check.problem);
      }

      await removeItem(tx, playerId, item.id, 1);
      await addItem(tx, playerId, current.itemId, 1);
      await tx.placement.update({
        where: { id: current.id },
        data: { itemId: item.id },
      });

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
