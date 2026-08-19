import { describe, expect, it } from 'vitest';
import { computeStats } from '../src/economy';
import {
  LEGACY_PERKS,
  REBIRTH,
  REBIRTH_KEEPS,
  REBIRTH_RESETS,
  checkRebirth,
  erfenisFor,
  getLegacyPerk,
  legacyBonuses,
  legacyCost,
  legacyLevel,
  pendingErfenis,
} from '../src/rebirth';

const M = 1_000_000;

describe('erfenis verdienen', () => {
  it('levert niets op zonder opbrengst', () => {
    expect(erfenisFor(0)).toBe(0);
    expect(erfenisFor(-100)).toBe(0);
  });

  it('volgt een wortelcurve, dus latere miljoenen leveren minder op', () => {
    expect(erfenisFor(1 * M)).toBe(12);
    expect(erfenisFor(4 * M)).toBe(24);
    expect(erfenisFor(100 * M)).toBe(120);

    const eerste = erfenisFor(1 * M) - erfenisFor(0);
    const latere = erfenisFor(101 * M) - erfenisFor(100 * M);
    expect(latere).toBeLessThan(eerste);
  });

  it('geeft alleen het verschil met wat je al hebt gehad', () => {
    expect(pendingErfenis(4 * M, 0)).toBe(24);
    expect(pendingErfenis(4 * M, 12)).toBe(12);
    expect(pendingErfenis(4 * M, 24)).toBe(0);
    // Nooit negatief, ook niet als er ooit meer is uitgekeerd.
    expect(pendingErfenis(1 * M, 999)).toBe(0);
  });

  it('maakt elke volgende rebirth zwaarder zonder aparte teller', () => {
    const eerste = checkRebirth(99, 0, 0).earningsNeeded;
    const tiende = checkRebirth(99, 0, 100).earningsNeeded;
    expect(tiende).toBeGreaterThan(eerste * 10);
  });
});

describe('mag ik een rebirth doen', () => {
  it('eist zowel een level als genoeg winst', () => {
    const teLaagLevel = checkRebirth(REBIRTH.requiredLevel - 1, 100 * M, 0);
    expect(teLaagLevel.hasGain).toBe(true);
    expect(teLaagLevel.hasLevel).toBe(false);
    expect(teLaagLevel.canRebirth).toBe(false);

    const teWeinigWinst = checkRebirth(REBIRTH.requiredLevel, 1_000, 0);
    expect(teWeinigWinst.hasLevel).toBe(true);
    expect(teWeinigWinst.hasGain).toBe(false);
    expect(teWeinigWinst.canRebirth).toBe(false);

    const goed = checkRebirth(REBIRTH.requiredLevel, 100 * M, 0);
    expect(goed.canRebirth).toBe(true);
    expect(goed.pending).toBe(120);
  });

  it('rekent terug hoeveel opbrengst er nog nodig is', () => {
    const readiness = checkRebirth(50, 0, 0);
    // Op precies dat bedrag moet het wél mogen.
    const opDeGrens = checkRebirth(50, readiness.earningsNeeded, 0);
    expect(opDeGrens.canRebirth).toBe(true);
    expect(opDeGrens.pending).toBeGreaterThanOrEqual(REBIRTH.minimumGain);
  });
});

describe('erfenis uitgeven', () => {
  it('wordt per level duurder', () => {
    const perk = getLegacyPerk('legacy_income');
    expect(legacyCost(perk, 0)).toBe(perk.baseCost);
    expect(legacyCost(perk, 1)).toBeGreaterThan(legacyCost(perk, 0));
    expect(legacyCost(perk, 10)).toBeGreaterThan(legacyCost(perk, 9));
  });

  it('klemt levels op het maximum', () => {
    const perk = getLegacyPerk('legacy_offline');
    expect(legacyLevel({ legacy_offline: 999 }, 'legacy_offline')).toBe(perk.maxLevel);
    expect(legacyLevel({ legacy_offline: -5 }, 'legacy_offline')).toBe(0);
    expect(legacyLevel({}, 'bestaat_niet')).toBe(0);
  });

  it('geeft neutrale bonussen zonder enige erfenis', () => {
    expect(legacyBonuses({})).toEqual({
      income: 1,
      sell: 1,
      xp: 1,
      offlineCapHours: 0,
      moveSpeed: 1,
      headstartCash: 0,
    });
  });

  it('telt de voordelen op', () => {
    const bonuses = legacyBonuses({
      legacy_income: 10,
      legacy_sell: 5,
      legacy_xp: 3,
      legacy_offline: 4,
      legacy_speed: 6,
      legacy_headstart: 2,
    });
    expect(bonuses.income).toBeCloseTo(1.3, 5);
    expect(bonuses.sell).toBeCloseTo(1.1, 5);
    expect(bonuses.xp).toBeCloseTo(1.12, 5);
    expect(bonuses.offlineCapHours).toBe(4);
    expect(bonuses.moveSpeed).toBeCloseTo(1.12, 5);
    expect(bonuses.headstartCash).toBe(50_000);
  });

  it('heeft voor elk voordeel een geldige definitie', () => {
    for (const perk of LEGACY_PERKS) {
      expect(perk.maxLevel, perk.id).toBeGreaterThan(0);
      expect(perk.baseCost, perk.id).toBeGreaterThan(0);
      expect(perk.growth, perk.id).toBeGreaterThan(1);
      expect(perk.perLevel, perk.id).toBeGreaterThan(0);
    }
  });
});

describe('erfenis in je statistieken', () => {
  const base = {
    propertyId: 'squat',
    vehicleId: 'on_foot',
    upgrades: {},
    placements: [],
  };

  it('verandert niets zonder erfenis', () => {
    const stats = computeStats(base);
    expect(stats.legacyMultiplier).toBe(1);
    expect(stats.sellMultiplier).toBe(1);
    expect(stats.xpMultiplier).toBe(1);
  });

  it('werkt door in inkomen, offline-cap en snelheid', () => {
    const zonder = computeStats(base);
    const met = computeStats({
      ...base,
      legacy: { legacy_income: 10, legacy_offline: 3, legacy_speed: 5, legacy_sell: 4 },
    });

    expect(met.incomePerHour).toBeCloseTo(zonder.incomePerHour * 1.3, 4);
    expect(met.offlineCapHours).toBe(zonder.offlineCapHours + 3);
    expect(met.moveSpeed).toBeCloseTo(zonder.moveSpeed * 1.1, 5);
    expect(met.sellMultiplier).toBeCloseTo(1.08, 5);
  });

  it('stapelt met flex, upgrades en boosts in plaats van ze te vervangen', () => {
    const stats = computeStats({
      ...base,
      upgrades: { bookkeeper: 5 },
      activeBoostIds: ['coffee'],
      legacy: { legacy_income: 10 },
      placements: [{ id: 'a', itemId: 'aquarium', x: 0, z: 0, rotation: 0 }],
    });
    const verwacht =
      (5 + 28) *
      (1 + stats.flexMultiplier) *
      stats.upgradeMultiplier *
      stats.boostMultiplier *
      1.3 *
      (1 + stats.decorationBonus);
    expect(stats.incomePerHour).toBeCloseTo(Math.round(verwacht * 100) / 100, 1);
  });
});

describe('uitleg aan de speler', () => {
  it('somt op wat je kwijtraakt en wat je houdt', () => {
    expect(REBIRTH_RESETS.length).toBeGreaterThan(3);
    expect(REBIRTH_KEEPS.length).toBeGreaterThan(3);
    // Gems en erfenis mogen nooit in de resetlijst staan.
    const resets = REBIRTH_RESETS.join(' ').toLowerCase();
    expect(resets).not.toContain('gems');
    expect(resets).not.toContain('erfenis');
  });
});
