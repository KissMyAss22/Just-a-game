import {
  BASE_UPGRADES,
  PROPERTIES,
  VEHICLES,
  buyPropertySchema,
  buyUpgradeSchema,
  buyVehicleSchema,
  equipVehicleSchema,
  getProperty,
  getUpgrade,
  getVehicle,
  propertySlots,
  upgradeCost,
} from '@game/shared';
import type { FastifyInstance } from 'fastify';
import { authenticate, playerIdOf } from '../lib/auth.js';
import { GameError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { spend } from '../services/ledger.js';
import { loadPlayer, settleVault, toPlayerStateDto } from '../services/player.js';
import { trackQuest } from '../services/quests.js';

export async function shopRoutes(app: FastifyInstance): Promise<void> {
  /** De hele winkel met actuele prijzen voor deze speler. */
  app.get('/shop', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const loaded = await loadPlayer(prisma, playerId);
    const cash = Number(loaded.player.cash);
    const level = loaded.level;

    return {
      cash,
      upgrades: BASE_UPGRADES.map((upgrade) => {
        const current = loaded.upgrades[upgrade.id] ?? 0;
        const maxed = current >= upgrade.maxLevel;
        const price = maxed ? null : upgradeCost(upgrade.baseCost, current);
        return {
          id: upgrade.id,
          name: upgrade.name,
          description: upgrade.description,
          icon: upgrade.icon,
          level: current,
          maxLevel: upgrade.maxLevel,
          price,
          affordable: price !== null && cash >= price,
        };
      }),
      properties: PROPERTIES.map((property) => ({
        id: property.id,
        name: property.name,
        icon: property.icon,
        tier: property.tier,
        price: property.price,
        incomePerHour: property.incomePerHour,
        slots: propertySlots(property.id),
        vaultCapacity: property.vaultCapacity,
        offlineCapHours: property.offlineCapHours,
        flex: property.flex,
        requiredLevel: property.requiredLevel,
        owned: getProperty(loaded.player.propertyId).tier >= property.tier,
        current: loaded.player.propertyId === property.id,
        affordable: cash >= property.price,
        unlocked: level >= property.requiredLevel,
      })),
      vehicles: VEHICLES.map((vehicle) => ({
        id: vehicle.id,
        name: vehicle.name,
        icon: vehicle.icon,
        tier: vehicle.tier,
        price: vehicle.price,
        speedMultiplier: vehicle.speedMultiplier,
        carryBonus: vehicle.carryBonus,
        flex: vehicle.flex,
        requiredLevel: vehicle.requiredLevel,
        owned: loaded.ownedVehicleIds.includes(vehicle.id),
        current: loaded.player.vehicleId === vehicle.id,
        affordable: cash >= vehicle.price,
        unlocked: level >= vehicle.requiredLevel,
      })),
    };
  });

  app.post('/shop/upgrade', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = buyUpgradeSchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      // Eerst afrekenen tegen de oude rate.
      await settleVault(tx, loaded, now);

      const upgrade = getUpgrade(body.upgradeId);
      const current = loaded.upgrades[upgrade.id] ?? 0;
      if (current >= upgrade.maxLevel) {
        throw new GameError('Deze upgrade is al maximaal.', 400, 'upgrade_maxed');
      }

      const price = upgradeCost(upgrade.baseCost, current);
      await spend(tx, playerId, 'cash', price, 'buy_upgrade', {
        upgradeId: upgrade.id,
        level: current + 1,
      });

      await tx.playerUpgrade.upsert({
        where: { playerId_upgradeId: { playerId, upgradeId: upgrade.id } },
        create: { playerId, upgradeId: upgrade.id, level: 1 },
        update: { level: { increment: 1 } },
      });
      await trackQuest(tx, playerId, loaded.player.seed, now, 'buy_upgrades', 1);

      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return toPlayerStateDto(refreshed, accrual, now);
    });
  });

  app.post('/shop/property', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = buyPropertySchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      await settleVault(tx, loaded, now);

      const target = getProperty(body.propertyId);
      const current = getProperty(loaded.player.propertyId);
      if (target.tier <= current.tier) {
        throw new GameError('Je hebt al iets beters.', 400, 'already_owned');
      }
      if (loaded.level < target.requiredLevel) {
        throw new GameError(
          `Hiervoor heb je level ${target.requiredLevel} nodig.`,
          400,
          'level_too_low',
        );
      }

      await spend(tx, playerId, 'cash', target.price, 'buy_property', { propertyId: target.id });
      await tx.player.update({ where: { id: playerId }, data: { propertyId: target.id } });

      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return toPlayerStateDto(refreshed, accrual, now);
    });
  });

  app.post('/shop/vehicle', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = buyVehicleSchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      await settleVault(tx, loaded, now);

      const vehicle = getVehicle(body.vehicleId);
      if (loaded.ownedVehicleIds.includes(vehicle.id)) {
        throw new GameError('Dit voertuig heb je al.', 400, 'already_owned');
      }
      if (loaded.level < vehicle.requiredLevel) {
        throw new GameError(
          `Hiervoor heb je level ${vehicle.requiredLevel} nodig.`,
          400,
          'level_too_low',
        );
      }

      await spend(tx, playerId, 'cash', vehicle.price, 'buy_vehicle', { vehicleId: vehicle.id });
      await tx.playerVehicle.create({ data: { playerId, vehicleId: vehicle.id } });
      await tx.player.update({ where: { id: playerId }, data: { vehicleId: vehicle.id } });

      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return toPlayerStateDto(refreshed, accrual, now);
    });
  });

  app.post('/shop/vehicle/equip', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = equipVehicleSchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      await settleVault(tx, loaded, now);

      if (!loaded.ownedVehicleIds.includes(body.vehicleId)) {
        throw new GameError('Dit voertuig heb je niet.', 400, 'not_owned');
      }
      await tx.player.update({ where: { id: playerId }, data: { vehicleId: body.vehicleId } });

      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return toPlayerStateDto(refreshed, accrual, now);
    });
  });
}
