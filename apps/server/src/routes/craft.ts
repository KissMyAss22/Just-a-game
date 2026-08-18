import { RECIPES, checkRecipe, craftSchema, getItem, getRecipe } from '@game/shared';
import type { FastifyInstance } from 'fastify';
import { authenticate, playerIdOf } from '../lib/auth.js';
import { GameError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { spend } from '../services/ledger.js';
import { addItem, loadPlayer, removeItem, settleVault, toPlayerStateDto } from '../services/player.js';

export async function craftRoutes(app: FastifyInstance): Promise<void> {
  /** Alle recepten, met per recept of je hem nu kunt maken. */
  app.get('/craft', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const loaded = await loadPlayer(prisma, playerId);
    const cash = Number(loaded.player.cash);

    return {
      cash,
      level: loaded.level,
      recipes: RECIPES.map((recipe) => {
        const output = getItem(recipe.output.itemId);
        return {
          id: recipe.id,
          name: recipe.name,
          description: recipe.description,
          icon: recipe.icon,
          cashCost: recipe.cashCost,
          requiredLevel: recipe.requiredLevel,
          inputs: recipe.inputs.map((input) => ({
            itemId: input.itemId,
            quantity: input.quantity,
            name: getItem(input.itemId).name,
            icon: getItem(input.itemId).icon,
          })),
          output: {
            itemId: output.id,
            quantity: recipe.output.quantity,
            name: output.name,
            icon: output.icon,
            rarity: output.rarity,
            incomePerHour: output.incomePerHour ?? 0,
            flex: output.flex ?? 0,
          },
          readiness: checkRecipe(recipe, loaded.inventory, cash, loaded.level),
        };
      }),
    };
  });

  /** Maakt een recept. De server controleert alles opnieuw. */
  app.post('/craft', { preHandler: authenticate }, async (request) => {
    const playerId = playerIdOf(request);
    const body = craftSchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      // Eerst afrekenen tegen de oude rate; craften verandert niets aan je
      // inkomen, maar het item dat je erna plaatst wel.
      await settleVault(tx, loaded, now);

      const recipe = getRecipe(body.recipeId);
      const times = body.times;

      // Het recept `times` keer uitvoeren = alle hoeveelheden schalen.
      const scaled = {
        ...recipe,
        cashCost: recipe.cashCost * times,
        inputs: recipe.inputs.map((input) => ({
          itemId: input.itemId,
          quantity: input.quantity * times,
        })),
      };

      const readiness = checkRecipe(
        scaled,
        loaded.inventory,
        Number(loaded.player.cash),
        loaded.level,
      );
      if (!readiness.hasLevel) {
        throw new GameError(
          `Hiervoor heb je level ${recipe.requiredLevel} nodig.`,
          400,
          'level_too_low',
        );
      }
      if (readiness.missing.length > 0) {
        const first = readiness.missing[0]!;
        throw new GameError(
          `Je hebt nog ${first.needed}x ${getItem(first.itemId).name} nodig.`,
          400,
          'missing_materials',
        );
      }
      if (!readiness.hasCash) {
        throw new GameError('Je hebt niet genoeg geld.', 400, 'not_enough_cash');
      }

      for (const input of scaled.inputs) {
        await removeItem(tx, playerId, input.itemId, input.quantity);
      }
      await spend(tx, playerId, 'cash', scaled.cashCost, 'craft', {
        recipeId: recipe.id,
        times,
      });
      await addItem(tx, playerId, recipe.output.itemId, recipe.output.quantity * times);

      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      const output = getItem(recipe.output.itemId);

      return {
        crafted: {
          itemId: output.id,
          name: output.name,
          icon: output.icon,
          rarity: output.rarity,
          quantity: recipe.output.quantity * times,
        },
        state: toPlayerStateDto(refreshed, accrual, now),
      };
    });
  });
}
