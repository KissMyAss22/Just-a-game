import { moveBudget, reportPositionSchema, resolveMovement } from '@game/shared';
import type { FastifyInstance } from 'fastify';
import { authenticate, playerIdOf } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import { loadPlayer, settleVault, toPlayerStateDto } from '../services/player.js';
import { trackQuest } from '../services/quests.js';

export async function stateRoutes(app: FastifyInstance): Promise<void> {
  /** De volledige toestand van de speler. De app haalt dit op bij het starten. */
  app.get('/state', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, loaded, now);
      return toPlayerStateDto(loaded, accrual, now);
    });
  });

  /**
   * Positiemelding vanuit de app. Dit is geen autoriteit over waar je staat —
   * het is de referentie waartegen de server later een oprap-actie toetst,
   * plus de bron voor de "afgelegde afstand"-quests.
   */
  app.post('/player/position', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = reportPositionSchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      const elapsed = Math.max(0, now.getTime() - loaded.player.positionAt.getTime()) / 1000;
      const maxDistance = moveBudget(loaded.stats.moveSpeed, elapsed, 30);

      // Accepteer alleen een geloofwaardige verplaatsing, en zorg dat de
      // positie sowieso op begaanbaar terrein ligt.
      const accepted = Math.min(body.distance, maxDistance);
      const safe = resolveMovement(loaded.player.x, loaded.player.z, body.x, body.z, 0.45);

      await tx.player.update({
        where: { id: playerId },
        data: {
          x: safe.x,
          z: safe.z,
          positionAt: now,
          distanceTotal: { increment: accepted },
        },
      });

      if (accepted > 0) {
        await trackQuest(
          tx,
          playerId,
          loaded.player.seed,
          now,
          'distance',
          Math.round(accepted),
        );
      }

      return { x: safe.x, z: safe.z, serverTime: now.getTime() };
    });
  });
}
