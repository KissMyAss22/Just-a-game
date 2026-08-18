import {
  SEASON,
  SEASON_TIERS,
  claimQuestSchema,
  claimTierSchema,
  getVehicle,
  seasonForTimestamp,
  seasonProgress,
  tierForXp,
  type Reward,
} from '@game/shared';
import type { FastifyInstance } from 'fastify';
import { authenticate, playerIdOf } from '../lib/auth.js';
import { GameError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { grant, spend, type Tx } from '../services/ledger.js';
import { addItem, loadPlayer } from '../services/player.js';
import { claimQuest, questViews } from '../services/quests.js';

/** Zorgt dat er een voortgangsrij bestaat voor het lopende seizoen. */
async function ensureSeason(tx: Tx, playerId: string, seasonIndex: number) {
  return tx.seasonProgress.upsert({
    where: { playerId_seasonIndex: { playerId, seasonIndex } },
    create: { playerId, seasonIndex },
    update: {},
  });
}

/** Keert een lijst beloningen uit. */
async function applyRewards(
  tx: Tx,
  playerId: string,
  rewards: readonly Reward[],
  reason: string,
): Promise<void> {
  for (const reward of rewards) {
    switch (reward.kind) {
      case 'cash':
        await grant(tx, playerId, 'cash', reward.amount, reason);
        break;
      case 'gems':
        await grant(tx, playerId, 'gems', reward.amount, reason);
        break;
      case 'item':
        await addItem(tx, playerId, reward.itemId, reward.amount);
        break;
      case 'vehicle': {
        const vehicle = getVehicle(reward.vehicleId);
        await tx.playerVehicle.upsert({
          where: { playerId_vehicleId: { playerId, vehicleId: vehicle.id } },
          create: { playerId, vehicleId: vehicle.id },
          update: {},
        });
        break;
      }
      case 'seasonXp':
        await tx.seasonProgress.updateMany({
          where: { playerId },
          data: { seasonXp: { increment: reward.amount } },
        });
        break;
      case 'boost':
        // Boosts krijgen hun eigen tabel zodra ze in fase 2 echt gaan werken.
        break;
    }
  }
}

export async function seasonRoutes(app: FastifyInstance): Promise<void> {
  /** De volledige season pass: tiers, voortgang, quests. */
  app.get('/season', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const now = new Date();
    const window = seasonForTimestamp(now.getTime());

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      const progress = await ensureSeason(tx, playerId, window.index);
      const view = seasonProgress(progress.seasonXp);
      const quests = await questViews(tx, playerId, loaded.player.seed, now);

      return {
        season: window,
        seasonXp: view.seasonXp,
        tier: view.tier,
        xpIntoTier: view.xpIntoTier,
        xpForNextTier: view.xpForNextTier,
        premium: progress.premium,
        premiumPriceGems: SEASON.premiumPriceGems,
        gems: loaded.player.gems,
        claimedFree: progress.claimedFree,
        claimedPremium: progress.claimedPremium,
        tiers: SEASON_TIERS,
        quests,
        serverTime: now.getTime(),
      };
    });
  });

  /** Ontgrendelt het premium spoor met gems. */
  app.post('/season/premium', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const now = new Date();
    const window = seasonForTimestamp(now.getTime());

    return prisma.$transaction(async (tx) => {
      const progress = await ensureSeason(tx, playerId, window.index);
      if (progress.premium) {
        throw new GameError('Je hebt het premium spoor al.', 400, 'already_premium');
      }
      await spend(tx, playerId, 'gems', SEASON.premiumPriceGems, 'season_premium', {
        seasonIndex: window.index,
      });
      await tx.seasonProgress.update({
        where: { playerId_seasonIndex: { playerId, seasonIndex: window.index } },
        data: { premium: true },
      });
      return { premium: true, seasonIndex: window.index };
    });
  });

  /** Int de beloning van één tier, op het gratis of het premium spoor. */
  app.post('/season/claim', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = claimTierSchema.parse(request.body);
    const now = new Date();
    const window = seasonForTimestamp(now.getTime());

    return prisma.$transaction(async (tx) => {
      const progress = await ensureSeason(tx, playerId, window.index);
      const reached = tierForXp(progress.seasonXp);
      if (body.tier > reached) {
        throw new GameError('Deze tier heb je nog niet gehaald.', 400, 'tier_not_reached');
      }
      if (body.track === 'premium' && !progress.premium) {
        throw new GameError('Hiervoor heb je het premium spoor nodig.', 400, 'premium_required');
      }

      const tierDef = SEASON_TIERS.find((t) => t.tier === body.tier);
      if (!tierDef) throw new GameError('Onbekende tier.', 404, 'tier_not_found');

      const claimed = body.track === 'free' ? progress.claimedFree : progress.claimedPremium;
      if (claimed.includes(body.tier)) {
        throw new GameError('Deze beloning heb je al opgehaald.', 400, 'already_claimed');
      }

      const rewards = body.track === 'free' ? tierDef.free : tierDef.premium;
      if (rewards.length === 0) {
        throw new GameError('Hier zit geen beloning op.', 400, 'no_reward');
      }

      await applyRewards(tx, playerId, rewards, `season_${body.track}`);
      await tx.seasonProgress.update({
        where: { playerId_seasonIndex: { playerId, seasonIndex: window.index } },
        data:
          body.track === 'free'
            ? { claimedFree: { push: body.tier } }
            : { claimedPremium: { push: body.tier } },
      });

      return { tier: body.tier, track: body.track, rewards };
    });
  });

  /** Int een afgeronde quest; de season-XP komt bij je pass-voortgang. */
  app.post('/season/quest/claim', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = claimQuestSchema.parse(request.body);
    const now = new Date();
    const window = seasonForTimestamp(now.getTime());

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      await ensureSeason(tx, playerId, window.index);

      const result = await claimQuest(tx, playerId, loaded.player.seed, now, body.questId);
      const updated = await tx.seasonProgress.update({
        where: { playerId_seasonIndex: { playerId, seasonIndex: window.index } },
        data: { seasonXp: { increment: result.seasonXp } },
      });

      const view = seasonProgress(updated.seasonXp);
      return {
        questId: body.questId,
        seasonXpGained: result.seasonXp,
        seasonXp: view.seasonXp,
        tier: view.tier,
        xpIntoTier: view.xpIntoTier,
      };
    });
  });
}
