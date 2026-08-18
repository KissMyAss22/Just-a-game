import {
  LEGACY_PERKS,
  REBIRTH,
  REBIRTH_KEEPS,
  REBIRTH_RESETS,
  STARTER_PROPERTY_ID,
  STARTER_VEHICLE_ID,
  buyLegacyPerkSchema,
  checkRebirth,
  getLegacyPerk,
  legacyBonuses,
  levelFromTotalXp,
  legacyCost,
  rebirthSchema,
  spawnPosition,
} from '@game/shared';
import type { FastifyInstance } from 'fastify';
import { authenticate, playerIdOf } from '../lib/auth.js';
import { GameError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { grant, spend } from '../services/ledger.js';
import { loadPlayer, settleVault, toPlayerStateDto } from '../services/player.js';

export async function rebirthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Wat een rebirth nu zou opleveren, plus wat je ervoor inlevert. De app
   * toont exact deze lijsten, zodat niemand voor een verrassing komt te staan.
   */
  app.get('/rebirth', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      // Bijwerken, zodat wat er in de kluis staat meetelt in de voorspelling.
      const accrual = await settleVault(tx, loaded, now);

      const lifetime = Number(loaded.player.lifetimeEarned) + Math.floor(accrual.vaultBalance);
      const readiness = checkRebirth(
        loaded.level,
        lifetime,
        loaded.player.erfenisClaimed,
      );
      const bonuses = legacyBonuses(loaded.legacy);

      return {
        ...readiness,
        requiredLevel: REBIRTH.requiredLevel,
        minimumGain: REBIRTH.minimumGain,
        level: loaded.level,
        lifetimeEarned: lifetime,
        erfenis: loaded.player.erfenis,
        rebirthCount: loaded.player.rebirthCount,
        resets: REBIRTH_RESETS,
        keeps: REBIRTH_KEEPS,
        bonuses,
        perks: LEGACY_PERKS.map((perk) => {
          const level = loaded.legacy[perk.id] ?? 0;
          const maxed = level >= perk.maxLevel;
          const cost = maxed ? null : legacyCost(perk, level);
          return {
            id: perk.id,
            name: perk.name,
            description: perk.description,
            icon: perk.icon,
            level,
            maxLevel: perk.maxLevel,
            cost,
            affordable: cost !== null && loaded.player.erfenis >= cost,
          };
        }),
        serverTime: now.getTime(),
      };
    });
  });

  /**
   * Opnieuw beginnen. Onomkeerbaar, dus de client moet expliciet bevestigen.
   *
   * Volgorde is belangrijk: eerst de kluis innen (die opbrengst hoort nog bij
   * dit leven), dan de erfenis berekenen, en pas daarna wissen.
   */
  app.post('/rebirth', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    rebirthSchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      await settleVault(tx, loaded, now);

      // De kluis leegt in je cash, zodat die opbrengst nog meetelt.
      const vault = Math.floor(Number(loaded.player.vaultBalance));
      if (vault > 0) {
        await tx.player.update({ where: { id: playerId }, data: { vaultBalance: BigInt(0) } });
        await grant(tx, playerId, 'cash', vault, 'rebirth_vault_payout');
      }

      const fresh = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
      const readiness = checkRebirth(
        levelFromTotalXp(fresh.xp).level,
        Number(fresh.lifetimeEarned),
        fresh.erfenisClaimed,
      );

      if (!readiness.hasLevel) {
        throw new GameError(
          `Je hebt level ${REBIRTH.requiredLevel} nodig voor een rebirth.`,
          400,
          'level_too_low',
        );
      }
      if (!readiness.hasGain) {
        throw new GameError(
          `Een rebirth levert nu maar ${readiness.pending} erfenis op; dat is het niet waard. Verdien eerst meer.`,
          400,
          'not_enough_gain',
        );
      }

      // Cash naar nul via het grootboek, zodat de som blijft kloppen.
      const cash = Number(fresh.cash);
      if (cash > 0) await spend(tx, playerId, 'cash', cash, 'rebirth_reset');

      await tx.playerUpgrade.deleteMany({ where: { playerId } });
      await tx.playerVehicle.deleteMany({ where: { playerId } });
      await tx.inventoryItem.deleteMany({ where: { playerId } });
      await tx.placement.deleteMany({ where: { playerId } });

      const start = spawnPosition();
      await tx.player.update({
        where: { id: playerId },
        data: {
          level: 1,
          xp: 0,
          propertyId: STARTER_PROPERTY_ID,
          vehicleId: STARTER_VEHICLE_ID,
          vaultBalance: BigInt(0),
          accruedAt: now,
          x: start.x,
          z: start.z,
          positionAt: now,
          rebirthCount: { increment: 1 },
          erfenisClaimed: { increment: readiness.pending },
          vehicles: { create: { vehicleId: STARTER_VEHICLE_ID } },
        },
      });

      await grant(tx, playerId, 'erfenis', readiness.pending, 'rebirth', {
        rebirthCount: fresh.rebirthCount + 1,
        lifetimeEarned: Number(fresh.lifetimeEarned),
      });

      // Startkapitaal telt bewust niet mee als opbrengst.
      const headstart = legacyBonuses(loaded.legacy).headstartCash;
      if (headstart > 0) {
        await grant(tx, playerId, 'cash', headstart, 'rebirth_headstart', undefined, false);
      }

      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return {
        erfenisGained: readiness.pending,
        headstart,
        rebirthCount: fresh.rebirthCount + 1,
        state: toPlayerStateDto(refreshed, accrual, now),
      };
    });
  });

  /** Koopt een permanent voordeel met erfenis. */
  app.post('/rebirth/perk', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = buyLegacyPerkSchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      // Eerst afrekenen tegen de oude rate; het voordeel verhoogt hem daarna.
      await settleVault(tx, loaded, now);

      const perk = getLegacyPerk(body.perkId);
      const level = loaded.legacy[perk.id] ?? 0;
      if (level >= perk.maxLevel) {
        throw new GameError('Dit voordeel is al maximaal.', 400, 'perk_maxed');
      }

      const cost = legacyCost(perk, level);
      await spend(tx, playerId, 'erfenis', cost, 'buy_legacy_perk', {
        perkId: perk.id,
        level: level + 1,
      });

      await tx.playerLegacy.upsert({
        where: { playerId_perkId: { playerId, perkId: perk.id } },
        create: { playerId, perkId: perk.id, level: 1 },
        update: { level: { increment: 1 } },
      });

      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return { perkId: perk.id, level: level + 1, state: toPlayerStateDto(refreshed, accrual, now) };
    });
  });
}
