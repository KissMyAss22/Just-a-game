import { PrismaClient } from '@prisma/client';
import { env } from '../env.js';

/**
 * BigInt heeft geen JSON-representatie. Cash kan in een idle game groot
 * worden, dus slaan we het op als BigInt maar sturen we het als getal —
 * veilig tot 9.007.199.254.740.991, ruim boven alles wat het spel bereikt.
 */
declare global {
  interface BigInt {
    toJSON(): number;
  }
}
BigInt.prototype.toJSON = function toJSON(this: bigint): number {
  return Number(this);
};

export const prisma = new PrismaClient({
  datasources: { db: { url: env.databaseUrl } },
  log: env.isProduction ? ['warn', 'error'] : ['warn', 'error'],
});

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
