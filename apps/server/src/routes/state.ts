import {
  DEV_SPEED_ALLOWANCE,
  isParkSide,
  moveBudget,
  reportPositionSchema,
  resolveMovement,
  worldToCell,
} from '@game/shared';
import type { FastifyInstance } from 'fastify';
import { authenticate, playerIdOf } from '../lib/auth.js';
import { env } from '../env.js';
import { prisma } from '../lib/prisma.js';
import { bankParkLoot, loadPlayer, settleVault, toPlayerStateDto } from '../services/player.js';
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
      const maxDistance = moveBudget(
        loaded.stats.moveSpeed,
        elapsed,
        30,
        env.devTools ? DEV_SPEED_ALLOWANCE : undefined,
      );

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

      // De landtong over naar de stad? Dan is je parkbuit veilig.
      //
      // Dit hangt aan de positiemelding omdat die er toch al is en toch al
      // gevalideerd wordt. Een aparte "bank mijn buit"-knop zou een tweede weg
      // openen die net zo streng gecontroleerd moet worden, voor niets.
      const wasInPark = isParkSide(
        worldToCell(loaded.player.x, loaded.player.z).cx,
        worldToCell(loaded.player.x, loaded.player.z).cz,
      );
      const nowInPark = isParkSide(worldToCell(safe.x, safe.z).cx, worldToCell(safe.x, safe.z).cz);
      const banked = wasInPark && !nowInPark ? await bankParkLoot(tx, playerId) : 0;

      return { x: safe.x, z: safe.z, banked, serverTime: now.getTime() };
    });
  });
}
