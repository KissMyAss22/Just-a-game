import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { env } from './env.js';
import { GameError } from './lib/errors.js';
import { disconnectPrisma, prisma } from './lib/prisma.js';
import { authRoutes } from './routes/auth.js';
import { craftRoutes } from './routes/craft.js';
import { economyRoutes } from './routes/economy.js';
import { profileRoutes } from './routes/profile.js';
import { rebirthRoutes } from './routes/rebirth.js';
import { seasonRoutes } from './routes/season.js';
import { shopRoutes } from './routes/shop.js';
import { stateRoutes } from './routes/state.js';
import { worldRoutes } from './routes/world.js';
import { pruneExpiredBoosts } from './services/boosts.js';
import { ensureSpawns } from './services/spawner.js';

async function main(): Promise<void> {
  const app = Fastify({
    logger: env.isProduction
      ? true
      : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } },
  });

  // De app draait vanaf een telefoon op hetzelfde netwerk; in ontwikkeling
  // staat alles open, in productie zetten we hier de echte herkomst neer.
  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: env.jwtSecret });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof GameError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (error instanceof ZodError) {
      return reply
        .code(400)
        .send({ error: 'invalid_input', message: 'Ongeldige invoer.', issues: error.issues });
    }
    app.log.error(error);
    const fastifyError = error as { statusCode?: number; message?: string };
    const status =
      fastifyError.statusCode && fastifyError.statusCode >= 400 ? fastifyError.statusCode : 500;
    return reply.code(status).send({
      error: 'server_error',
      message:
        status === 500
          ? 'Er ging iets mis op de server.'
          : (fastifyError.message ?? 'Er ging iets mis.'),
    });
  });

  await app.register(authRoutes);
  await app.register(stateRoutes);
  await app.register(worldRoutes);
  await app.register(economyRoutes);
  await app.register(shopRoutes);
  await app.register(seasonRoutes);
  await app.register(craftRoutes);
  await app.register(profileRoutes);
  await app.register(rebirthRoutes);

  await prisma.$connect();

  // Vul de stad meteen bij, en daarna op een vast ritme.
  await ensureSpawns().catch((error) => app.log.error(error, 'eerste spawnronde mislukt'));
  const spawnTimer = setInterval(() => {
    ensureSpawns().catch((error) => app.log.error(error, 'spawnronde mislukt'));
    pruneExpiredBoosts().catch((error) => app.log.error(error, 'opruimen boosts mislukt'));
  }, Math.max(5, env.spawnIntervalSeconds) * 1000);
  spawnTimer.unref();

  const close = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'server wordt afgesloten');
    clearInterval(spawnTimer);
    await app.close();
    await disconnectPrisma();
    process.exit(0);
  };
  process.on('SIGINT', () => void close('SIGINT'));
  process.on('SIGTERM', () => void close('SIGTERM'));

  await app.listen({ host: env.host, port: env.port });
  app.log.info(
    `Server draait. Zet in apps/mobile/.env: EXPO_PUBLIC_API_URL=http://<jouw-lan-ip>:${env.port}`,
  );
}

main().catch((error) => {
  console.error('Server kon niet starten:', error);
  process.exit(1);
});
