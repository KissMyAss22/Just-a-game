import { describe, expect, it } from 'vitest';
import {
  DAILY_QUEST_COUNT,
  PREMIUM_GEMS_TOTAL,
  SEASON,
  SEASON_DURATION_MS,
  SEASON_TIERS,
  WEEKLY_QUEST_COUNT,
  pickQuests,
  seasonForTimestamp,
  seasonProgress,
  tierForXp,
} from '../src/season';

describe('seizoenen', () => {
  it('begint op de epoch met seizoen 1', () => {
    const season = seasonForTimestamp(SEASON.epoch);
    expect(season.index).toBe(1);
    expect(season.startsAt).toBe(SEASON.epoch);
    expect(season.endsAt).toBe(SEASON.epoch + SEASON_DURATION_MS);
  });

  it('rolt precies op de grens door naar het volgende seizoen', () => {
    const laatste = seasonForTimestamp(SEASON.epoch + SEASON_DURATION_MS - 1);
    const volgende = seasonForTimestamp(SEASON.epoch + SEASON_DURATION_MS);
    expect(laatste.index).toBe(1);
    expect(volgende.index).toBe(2);
    expect(volgende.startsAt).toBe(laatste.endsAt);
  });

  it('valt terug op seizoen 1 vóór de epoch', () => {
    expect(seasonForTimestamp(SEASON.epoch - 10_000).index).toBe(1);
  });
});

describe('tiers', () => {
  it('heeft precies het afgesproken aantal tiers', () => {
    expect(SEASON_TIERS).toHaveLength(SEASON.tiers);
    expect(SEASON_TIERS[0]?.tier).toBe(1);
    expect(SEASON_TIERS.at(-1)?.tier).toBe(SEASON.tiers);
  });

  it('rekent XP correct om naar een tier', () => {
    expect(tierForXp(0)).toBe(0);
    expect(tierForXp(SEASON.xpPerTier - 1)).toBe(0);
    expect(tierForXp(SEASON.xpPerTier)).toBe(1);
    expect(tierForXp(SEASON.xpPerTier * 999)).toBe(SEASON.tiers);
  });

  it('toont voortgang binnen een tier', () => {
    const progress = seasonProgress(SEASON.xpPerTier * 3 + 250);
    expect(progress.tier).toBe(3);
    expect(progress.xpIntoTier).toBe(250);
  });

  it('geeft in het premium spoor genoeg gems terug voor het volgende seizoen', () => {
    expect(PREMIUM_GEMS_TOTAL).toBeGreaterThanOrEqual(SEASON.premiumPriceGems);
  });

  it('geeft elke premium tier iets', () => {
    for (const tier of SEASON_TIERS) {
      expect(tier.premium.length, `tier ${tier.tier}`).toBeGreaterThan(0);
    }
  });
});

describe('quests', () => {
  it('kiest het juiste aantal zonder duplicaten', () => {
    for (const scope of ['daily', 'weekly'] as const) {
      const picked = pickQuests(scope, 1234, 20_000);
      const expected = scope === 'daily' ? DAILY_QUEST_COUNT : WEEKLY_QUEST_COUNT;
      expect(picked).toHaveLength(expected);
      expect(new Set(picked.map((q) => q.id)).size).toBe(expected);
      for (const quest of picked) expect(quest.scope).toBe(scope);
    }
  });

  it('is deterministisch per speler en periode', () => {
    const a = pickQuests('daily', 99, 20_100).map((q) => q.id);
    const b = pickQuests('daily', 99, 20_100).map((q) => q.id);
    expect(a).toEqual(b);
  });

  it('geeft verschillende spelers verschillende sets', () => {
    const sets = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => pickQuests('daily', seed, 20_100).map((q) => q.id).join(',')),
    );
    expect(sets.size).toBeGreaterThan(1);
  });
});
