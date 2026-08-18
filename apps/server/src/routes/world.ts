import {
  CITY,
  DISTRICTS,
  collectSpawnSchema,
  getItem,
  nearbySpawnsSchema,
  xpForItem,
} from '@game/shared';
import type { FastifyInstance } from 'fastify';
import { authenticate, playerIdOf } from '../lib/auth.js';
import { GameError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { addItem, inventoryCount, loadPlayer, grantXp } from '../services/player.js';
import { trackQuest } from '../services/quests.js';
import { collectSpawn, hotDistrict, nearbySpawns, spawnCounts } from '../services/spawner.js';

export async function worldRoutes(app: FastifyInstance): Promise<void> {
  /** Metadata over de stad: districten, seed en waar het nu druk is. */
  app.get('/world/city', { preHandler: authenticate }, async () => {
    const now = new Date();
    return {
      seed: CITY.seed,
      cellSize: CITY.cellSize,
      gridSize: CITY.gridSize,
      hotDistrictId: hotDistrict(now.getTime()),
      districts: DISTRICTS.map((d) => ({
        id: d.id,
        name: d.name,
        tagline: d.tagline,
        bounds: d.bounds,
        unlockLevel: d.unlockLevel,
      })),
      spawnCounts: await spawnCounts(now),
      serverTime: now.getTime(),
    };
  });

  /** De items die op dit moment rond de speler op straat liggen. */
  app.get('/world/spawns', { preHandler: authenticate }, async (request) => {
    const query = nearbySpawnsSchema.parse({
      x: Number((request.query as Record<string, unknown>).x),
      z: Number((request.query as Record<string, unknown>).z),
      radius: (request.query as Record<string, unknown>).radius
        ? Number((request.query as Record<string, unknown>).radius)
        : undefined,
    });
    const now = new Date();
    const spawns = await nearbySpawns(query.x, query.z, query.radius, now);
    return { spawns, serverTime: now.getTime() };
  });

  /** Item oprapen. Alle validatie zit in collectSpawn. */
  app.post('/world/collect', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = collectSpawnSchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);

      if (inventoryCount(loaded.inventory) >= loaded.stats.inventorySlots) {
        throw new GameError(
          'Je rugzak zit vol. Verkoop eerst wat of plaats items in je base.',
          400,
          'inventory_full',
        );
      }

      const outcome = await collectSpawn(tx, loaded, body.spawnId, body.x, body.z, now);
      const item = getItem(outcome.itemId);

      // Sommige boosts geven kans op een dubbele opbrengst. De worp gebeurt
      // hier op de server; de client hoort alleen de uitkomst.
      const doubled = Math.random() < loaded.stats.doubleDropChance;
      const quantity = doubled ? 2 : 1;

      await addItem(tx, playerId, item.id, quantity);
      const xp = await grantXp(
        tx,
        playerId,
        loaded.player.xp,
        loaded.level,
        xpForItem(item),
        loaded.stats.xpMultiplier,
      );

      await trackQuest(tx, playerId, loaded.player.seed, now, 'collect_items', quantity);
      await trackQuest(tx, playerId, loaded.player.seed, now, 'collect_rarity', 1, {
        itemId: item.id,
      });

      return {
        itemId: item.id,
        name: item.name,
        rarity: item.rarity,
        icon: item.icon,
        quantity,
        doubled,
        xpGained: xpForItem(item),
        level: xp.level,
        levelUp: xp.levelsGained > 0,
        levelRewards: xp.rewards,
        serverTime: now.getTime(),
      };
    });
  });
}
