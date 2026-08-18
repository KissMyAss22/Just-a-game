import {
  BOOSTS,
  BOOSTS_BY_ID,
  NAME_PROBLEM_MESSAGE,
  activateBoostSchema,
  normalizeAppearance,
  updateProfileSchema,
  validateDisplayName,
} from '@game/shared';
import type { FastifyInstance } from 'fastify';
import { authenticate, playerIdOf } from '../lib/auth.js';
import { GameError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { grantBoost } from '../services/boosts.js';
import { spend } from '../services/ledger.js';
import { loadPlayer, settleVault, toPlayerStateDto } from '../services/player.js';

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Naam en uiterlijk van je personage. Dit is wat andere spelers straks van
   * je zien, dus de naam wordt hier gecontroleerd — niet alleen in de app.
   */
  app.post('/player/profile', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = updateProfileSchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const data: { displayName?: string; appearance?: object } = {};

      if (body.displayName !== undefined) {
        const result = validateDisplayName(body.displayName);
        if (!result.ok) {
          throw new GameError(NAME_PROBLEM_MESSAGE[result.problem], 400, 'invalid_name');
        }
        data.displayName = result.name;
      }

      if (body.appearance !== undefined) {
        // Ook al valideert zod de vorm: normalizeAppearance klemt de indexen
        // op de palettes die echt bestaan.
        data.appearance = normalizeAppearance(body.appearance);
      }

      await tx.player.update({ where: { id: playerId }, data });

      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return toPlayerStateDto(refreshed, accrual, now);
    });
  });

  /** De boosts die je kunt kopen, plus wat er nu loopt. */
  app.get('/boosts', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const loaded = await loadPlayer(prisma, playerId);

    return {
      gems: loaded.player.gems,
      active: loaded.activeBoosts,
      catalog: BOOSTS.map((boost) => ({
        id: boost.id,
        name: boost.name,
        description: boost.description,
        icon: boost.icon,
        incomeBonus: boost.incomeBonus,
        spawnBonus: boost.spawnBonus ?? 0,
        durationHours: boost.durationHours,
        priceGems: boost.priceGems,
        affordable: loaded.player.gems >= boost.priceGems,
      })),
      serverTime: Date.now(),
    };
  });

  /** Koopt een boost met gems. */
  app.post('/boost/buy', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = activateBoostSchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      // Eerst afrekenen tegen de oude rate, dan pas de boost aanzetten.
      await settleVault(tx, loaded, now);

      const boost = BOOSTS_BY_ID[body.boostId];
      if (!boost) throw new GameError('Onbekende boost.', 404, 'boost_not_found');

      await spend(tx, playerId, 'gems', boost.priceGems, 'buy_boost', { boostId: boost.id });
      const expiresAt = await grantBoost(tx, playerId, boost.id, boost.durationHours, now);

      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return {
        boostId: boost.id,
        expiresAt: expiresAt.getTime(),
        state: toPlayerStateDto(refreshed, accrual, now),
      };
    });
  });
}
