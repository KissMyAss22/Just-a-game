import { getItem } from './items';
import type { ItemDef } from './types';

/**
 * Craften geeft materialen een bestemming.
 *
 * Zonder recepten is schroot alleen iets om te verkopen; met recepten wordt
 * het de grondstof voor interieur dat elk uur geld oplevert. De uitkomsten
 * zijn `craftOnly`-items: die liggen nooit op straat, dus de enige manier om
 * eraan te komen is ze zelf maken.
 */
export interface RecipeInput {
  itemId: string;
  quantity: number;
}

export interface RecipeDef {
  id: string;
  name: string;
  description: string;
  /** Wat je ervoor nodig hebt aan items. */
  inputs: readonly RecipeInput[];
  /** Extra kosten in cash. */
  cashCost: number;
  /** Wat je ervoor terugkrijgt. */
  output: RecipeInput;
  requiredLevel: number;
  icon: string;
}

export const RECIPES: readonly RecipeDef[] = [
  {
    id: 'craft_workbench',
    name: 'Werkbank',
    description: 'De eerste stap: van rommel iets dat geld oplevert.',
    inputs: [
      { itemId: 'scrap', quantity: 8 },
      { itemId: 'cardboard', quantity: 6 },
    ],
    cashCost: 500,
    output: { itemId: 'workbench', quantity: 1 },
    requiredLevel: 2,
    icon: '🪚',
  },
  {
    id: 'craft_neon_sign',
    name: 'Neonreclame',
    description: 'Koperdraad en gereedschap worden licht aan de muur.',
    inputs: [
      { itemId: 'copper', quantity: 6 },
      { itemId: 'toolbox', quantity: 2 },
      { itemId: 'scrap', quantity: 10 },
    ],
    cashCost: 3_200,
    output: { itemId: 'neon_sign', quantity: 1 },
    requiredLevel: 6,
    icon: '🪧',
  },
  {
    id: 'craft_home_gym',
    name: 'Thuisgym',
    description: 'Zwaar ijzer uit het industrieterrein.',
    inputs: [
      { itemId: 'scrap', quantity: 24 },
      { itemId: 'tyre', quantity: 4 },
      { itemId: 'toolbox', quantity: 3 },
    ],
    cashCost: 5_500,
    output: { itemId: 'home_gym', quantity: 1 },
    requiredLevel: 9,
    icon: '🏋️',
  },
  {
    id: 'craft_arcade',
    name: 'Arcadekast',
    description: 'Een verzegelde krat blijkt een halve speelhal te bevatten.',
    inputs: [
      { itemId: 'crate', quantity: 2 },
      { itemId: 'copper', quantity: 8 },
      { itemId: 'headlight', quantity: 2 },
    ],
    cashCost: 9_000,
    output: { itemId: 'arcade', quantity: 1 },
    requiredLevel: 12,
    icon: '🕹️',
  },
  {
    id: 'craft_race_sim',
    name: 'Racesimulator',
    description: 'Een turbokit die nooit een auto in gaat.',
    inputs: [
      { itemId: 'turbo', quantity: 2 },
      { itemId: 'arcade', quantity: 1 },
      { itemId: 'copper', quantity: 14 },
    ],
    cashCost: 42_000,
    output: { itemId: 'race_sim', quantity: 1 },
    requiredLevel: 18,
    icon: '🏎️',
  },
  {
    id: 'craft_art_wall',
    name: 'Kunstwand',
    description: 'Drie schilderijen en een hoop pretenties.',
    inputs: [
      { itemId: 'painting', quantity: 2 },
      { itemId: 'camera', quantity: 2 },
    ],
    cashCost: 65_000,
    output: { itemId: 'art_wall', quantity: 1 },
    requiredLevel: 22,
    icon: '🎨',
  },
  {
    id: 'craft_trophy_case',
    name: 'Prijzenkast',
    description: 'Alles wat je hebt bereikt, achter glas.',
    inputs: [
      { itemId: 'watch', quantity: 3 },
      { itemId: 'gold_bar', quantity: 2 },
      { itemId: 'race_sim', quantity: 1 },
    ],
    cashCost: 320_000,
    output: { itemId: 'trophy_case', quantity: 1 },
    requiredLevel: 28,
    icon: '🏆',
  },
  {
    id: 'craft_private_vault',
    name: 'Privékluis',
    description: 'Een race-ECU als slot. Niemand weet waarom het werkt.',
    inputs: [
      { itemId: 'race_ecu', quantity: 1 },
      { itemId: 'gold_bar', quantity: 4 },
      { itemId: 'engine_v8', quantity: 2 },
    ],
    cashCost: 900_000,
    output: { itemId: 'private_vault', quantity: 1 },
    requiredLevel: 34,
    icon: '🔒',
  },
] as const;

export const RECIPES_BY_ID: Readonly<Record<string, RecipeDef>> = Object.fromEntries(
  RECIPES.map((r) => [r.id, r]),
);

export function getRecipe(id: string): RecipeDef {
  const recipe = RECIPES_BY_ID[id];
  if (!recipe) throw new Error(`Onbekend recept: ${id}`);
  return recipe;
}

export interface RecipeReadiness {
  /** Ontbrekende ingrediënten, met hoeveel je er nog van nodig hebt. */
  missing: { itemId: string; needed: number; have: number }[];
  hasCash: boolean;
  hasLevel: boolean;
  canCraft: boolean;
}

/**
 * Controleert of een recept nu gemaakt kan worden. De server gebruikt dit om
 * te beslissen, de app om de knop grijs te maken — één regel voor beide.
 */
export function checkRecipe(
  recipe: RecipeDef,
  inventory: readonly { itemId: string; quantity: number }[],
  cash: number,
  level: number,
): RecipeReadiness {
  const owned = new Map(inventory.map((entry) => [entry.itemId, entry.quantity]));
  const missing: RecipeReadiness['missing'] = [];

  for (const input of recipe.inputs) {
    const have = owned.get(input.itemId) ?? 0;
    if (have < input.quantity) {
      missing.push({ itemId: input.itemId, needed: input.quantity - have, have });
    }
  }

  const hasCash = cash >= recipe.cashCost;
  const hasLevel = level >= recipe.requiredLevel;
  return { missing, hasCash, hasLevel, canCraft: missing.length === 0 && hasCash && hasLevel };
}

/** Het item dat een recept oplevert. */
export function recipeOutputItem(recipe: RecipeDef): ItemDef {
  return getItem(recipe.output.itemId);
}
