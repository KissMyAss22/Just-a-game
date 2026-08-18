import { STARTER_PROPERTY_ID, STARTER_VEHICLE_ID, guestLoginSchema, spawnPosition } from '@game/shared';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';

/**
 * Gast-accounts: de app verzint één keer een device-id en gebruikt dat om in
 * te loggen. Later kan hier e-mail of Sign in with Apple aan gekoppeld worden
 * zonder dat spelers hun voortgang verliezen.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/guest', async (request, reply) => {
    const body = guestLoginSchema.parse(request.body);
    const start = spawnPosition();

    const user = await prisma.user.upsert({
      where: { deviceId: body.deviceId },
      update: { lastSeen: new Date() },
      create: { deviceId: body.deviceId },
      include: { player: true },
    });

    let player = user.player;
    if (!player) {
      player = await prisma.player.create({
        data: {
          userId: user.id,
          displayName: body.displayName ?? `Speler ${user.id.slice(-4).toUpperCase()}`,
          seed: Math.floor(Math.random() * 2_147_483_646) + 1,
          propertyId: STARTER_PROPERTY_ID,
          vehicleId: STARTER_VEHICLE_ID,
          x: start.x,
          z: start.z,
          // In het verleden, anders blokkeert de cooldown de allereerste
          // actie van een nieuwe speler.
          lastCollectAt: new Date(Date.now() - 60_000),
          vehicles: { create: { vehicleId: STARTER_VEHICLE_ID } },
        },
      });
      app.log.info({ playerId: player.id }, 'nieuwe speler aangemaakt');
    }

    const token = app.jwt.sign({ sub: player.id }, { expiresIn: '90d' });
    return reply.send({
      token,
      playerId: player.id,
      displayName: player.displayName,
      serverTime: Date.now(),
    });
  });

  app.get('/health', async () => ({
    ok: true,
    serverTime: Date.now(),
    service: 'just-a-game',
  }));
}
