import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  OUTFIT_COLORS,
  SKIN_TONES,
  appearanceColors,
  normalizeAppearance,
  validateDisplayName,
} from '../src/character';
import { RECIPES, checkRecipe, getRecipe, recipeOutputItem } from '../src/crafting';
import {
  MANAGER,
  accrualCapacity,
  accrueIncome,
  afterManagerFee,
  computeStats,
  managerFee,
} from '../src/economy';
import { ITEMS, getItem, pickItemForDistrict } from '../src/items';
import { RARITIES } from '../src/types';

const HOUR = 3_600_000;

describe('manager', () => {
  it('rekent geen commissie zonder manager', () => {
    expect(managerFee(0)).toBe(0);
  });

  it('laat de commissie dalen per level en nooit onder 5%', () => {
    expect(managerFee(1)).toBeCloseTo(MANAGER.baseFee, 5);
    expect(managerFee(2)).toBeCloseTo(0.25, 5);
    expect(managerFee(6)).toBeCloseTo(0.05, 5);
    expect(managerFee(99)).toBe(0.05);
  });

  it('zet autoCollect aan zodra je een manager hebt', () => {
    const zonder = computeStats({
      propertyId: 'squat',
      vehicleId: 'on_foot',
      upgrades: {},
      placements: [],
    });
    expect(zonder.autoCollect).toBe(false);
    expect(zonder.managerFee).toBe(0);
    expect(accrualCapacity(zonder)).toBe(zonder.vaultCapacity);

    const met = computeStats({
      propertyId: 'squat',
      vehicleId: 'on_foot',
      upgrades: { manager: 2 },
      placements: [],
    });
    expect(met.autoCollect).toBe(true);
    expect(met.managerFee).toBeCloseTo(0.25, 5);
    expect(accrualCapacity(met)).toBe(Number.POSITIVE_INFINITY);
  });

  it('houdt commissie in maar nooit meer dan het bedrag', () => {
    expect(afterManagerFee(1_000, 0.25)).toEqual({ net: 750, fee: 250 });
    expect(afterManagerFee(0, 0.25)).toEqual({ net: 0, fee: 0 });
    expect(afterManagerFee(3, 0.3)).toEqual({ net: 3, fee: 0 });
  });

  it('laat de kluis met manager niet overlopen', () => {
    const stats = computeStats({
      propertyId: 'squat',
      vehicleId: 'on_foot',
      upgrades: { manager: 1 },
      placements: [],
    });

    // Zonder manager zou de kluis (400) na 80 uur allang vol zitten.
    const result = accrueIncome({
      ratePerHour: 100,
      accruedAt: 0,
      now: 80 * HOUR,
      offlineCapHours: stats.offlineCapHours,
      vaultBalance: 0,
      vaultCapacity: accrualCapacity(stats),
    });

    expect(result.earned).toBe(100 * stats.offlineCapHours);
    expect(result.cappedByVault).toBe(false);
  });
});

describe('boosts', () => {
  const base = {
    propertyId: 'squat',
    vehicleId: 'on_foot',
    upgrades: {},
    placements: [],
  };

  it('telt de inkomstenbonus van meerdere boosts op', () => {
    const stats = computeStats({ ...base, activeBoostIds: ['coffee', 'assistant'] });
    // koffie +25%, assistent +50%
    expect(stats.boostMultiplier).toBeCloseTo(1.75, 5);
  });

  it('vertaalt spawnBonus naar een kans op dubbele opbrengst', () => {
    expect(computeStats(base).doubleDropChance).toBe(0);
    const stats = computeStats({ ...base, activeBoostIds: ['city_deal'] });
    expect(stats.doubleDropChance).toBeCloseTo(0.25, 5);
  });

  it('begrenst de kans op dubbele opbrengst', () => {
    const stats = computeStats({
      ...base,
      activeBoostIds: ['city_deal', 'golden_hour', 'city_deal', 'golden_hour'],
    });
    expect(stats.doubleDropChance).toBeLessThanOrEqual(0.9);
  });

  it('negeert een onbekende boost', () => {
    const stats = computeStats({ ...base, activeBoostIds: ['bestaat-niet'] });
    expect(stats.boostMultiplier).toBe(1);
  });
});

describe('craften', () => {
  it('verwijst alleen naar bestaande items', () => {
    for (const recipe of RECIPES) {
      expect(() => getItem(recipe.output.itemId), recipe.id).not.toThrow();
      for (const input of recipe.inputs) {
        expect(() => getItem(input.itemId), `${recipe.id} -> ${input.itemId}`).not.toThrow();
      }
    }
  });

  it('levert altijd iets op dat je in je base kunt zetten', () => {
    for (const recipe of RECIPES) {
      const output = recipeOutputItem(recipe);
      expect(output.incomePerHour ?? 0, recipe.id).toBeGreaterThan(0);
    }
  });

  it('is een oplopende ladder: latere recepten vragen een hoger level', () => {
    const levels = RECIPES.map((r) => r.requiredLevel);
    const sorted = [...levels].sort((a, b) => a - b);
    expect(levels).toEqual(sorted);
  });

  it('herkent wat er ontbreekt', () => {
    const recipe = getRecipe('craft_workbench');
    const readiness = checkRecipe(recipe, [{ itemId: 'scrap', quantity: 3 }], 100, 1);
    expect(readiness.canCraft).toBe(false);
    expect(readiness.hasCash).toBe(false);
    expect(readiness.hasLevel).toBe(false);
    expect(readiness.missing).toEqual([
      { itemId: 'scrap', needed: 5, have: 3 },
      { itemId: 'cardboard', needed: 6, have: 0 },
    ]);
  });

  it('geeft groen licht als alles er is', () => {
    const recipe = getRecipe('craft_workbench');
    const readiness = checkRecipe(
      recipe,
      [
        { itemId: 'scrap', quantity: 8 },
        { itemId: 'cardboard', quantity: 6 },
      ],
      500,
      2,
    );
    expect(readiness).toEqual({ missing: [], hasCash: true, hasLevel: true, canCraft: true });
  });

  it('laat craft-only items nooit op straat liggen', () => {
    const craftOnly = ITEMS.filter((i) => i.craftOnly);
    expect(craftOnly.length).toBeGreaterThan(0);

    for (const rarity of RARITIES) {
      for (let roll = 0; roll < 1; roll += 0.02) {
        for (const district of ['oldTown', 'downtown', 'hills', 'island'] as const) {
          const picked = pickItemForDistrict(district, rarity, roll);
          if (picked) expect(picked.craftOnly, `${picked.id} mag niet spawnen`).toBeFalsy();
        }
      }
    }
  });
});

describe('personage', () => {
  it('accepteert een normale naam', () => {
    expect(validateDisplayName('  Dave  ')).toEqual({ ok: true, name: 'Dave' });
    expect(validateDisplayName('Jan de Vries')).toEqual({ ok: true, name: 'Jan de Vries' });
  });

  it('wijst te korte, te lange en rare namen af', () => {
    expect(validateDisplayName('ab')).toEqual({ ok: false, problem: 'too_short' });
    expect(validateDisplayName('x'.repeat(19))).toEqual({ ok: false, problem: 'too_long' });
    expect(validateDisplayName('foo<script>')).toEqual({
      ok: false,
      problem: 'invalid_characters',
    });
    expect(validateDisplayName('De Admin')).toEqual({ ok: false, problem: 'reserved' });
  });

  it('wijst dubbele spaties af in plaats van ze stilletjes te repareren', () => {
    expect(validateDisplayName('Jan  Vries')).toEqual({ ok: false, problem: 'bad_spacing' });
  });

  it('maakt van rommel uit de database altijd een geldig uiterlijk', () => {
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance('kapot')).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ skin: 999, outfit: -3, accent: 1.7 })).toEqual({
      skin: 0,
      outfit: 0,
      accent: 1,
    });
    expect(normalizeAppearance({ skin: 2, outfit: 3, accent: 1 })).toEqual({
      skin: 2,
      outfit: 3,
      accent: 1,
    });
  });

  it('geeft altijd echte kleuren terug', () => {
    const colors = appearanceColors({ skin: 2, outfit: 3, accent: 1 });
    expect(colors.skin).toBe(SKIN_TONES[2]);
    expect(colors.outfit).toBe(OUTFIT_COLORS[3]);
    expect(colors.accent).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
