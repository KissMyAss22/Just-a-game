import { describe, expect, it } from 'vitest';
import { getItem } from '../src/items';
import { getProperty } from '../src/properties';
import { getVehicle } from '../src/vehicles';
import {
  BASE_UPGRADES,
  ECONOMY,
  accrueIncome,
  computeStats,
  flexMultiplier,
  formatDuration,
  formatMoney,
  levelFromTotalXp,
  upgradeCost,
  xpForNextLevel,
} from '../src/economy';

const HOUR = 3_600_000;

describe('accrueIncome', () => {
  const base = {
    ratePerHour: 100,
    offlineCapHours: 8,
    vaultBalance: 0,
    vaultCapacity: 10_000,
  };

  it('schrijft inkomen bij naar rato van de verstreken tijd', () => {
    const result = accrueIncome({ ...base, accruedAt: 0, now: 2 * HOUR });
    expect(result.earned).toBe(200);
    expect(result.vaultBalance).toBe(200);
    expect(result.accruedAt).toBe(2 * HOUR);
    expect(result.cappedByTime).toBe(false);
    expect(result.cappedByVault).toBe(false);
  });

  it('verliest geen fracties bij vaak inloggen', () => {
    // 5 per uur betekent dat één hele eenheid 12 minuten duurt. Wie elke
    // minuut inlogt moet na een uur nog steeds 5 hebben, niet 0.
    let accruedAt = 0;
    let vaultBalance = 0;
    for (let minute = 1; minute <= 60; minute++) {
      const result = accrueIncome({
        ratePerHour: 5,
        offlineCapHours: 8,
        vaultBalance,
        vaultCapacity: 10_000,
        accruedAt,
        now: minute * 60_000,
      });
      accruedAt = result.accruedAt;
      vaultBalance = result.vaultBalance;
    }
    expect(vaultBalance).toBe(5);
  });

  it('stopt bij de opslaglimiet en markeert dat', () => {
    const result = accrueIncome({
      ...base,
      vaultCapacity: 150,
      accruedAt: 0,
      now: 5 * HOUR,
    });
    expect(result.earned).toBe(150);
    expect(result.vaultBalance).toBe(150);
    expect(result.cappedByVault).toBe(true);
  });

  it('telt niet langer dan de offline-cap en laat de tijd niet opsparen', () => {
    const result = accrueIncome({ ...base, accruedAt: 0, now: 48 * HOUR });
    expect(result.earned).toBe(800); // 8 uur x 100
    expect(result.cappedByTime).toBe(true);
    expect(result.secondsLostToCap).toBe(40 * 3_600);
    // accruedAt schuift mee op tot now, anders zou de volgende keer opnieuw
    // 48 uur meetellen.
    expect(result.accruedAt).toBe(48 * HOUR);
  });

  it('schuift de tijd door als de kluis vol is, zonder oneindig te sparen', () => {
    const result = accrueIncome({
      ...base,
      vaultBalance: 10_000,
      accruedAt: 0,
      now: 48 * HOUR,
    });
    expect(result.earned).toBe(0);
    expect(result.accruedAt).toBe(40 * HOUR); // now - cap
  });

  it('gaat goed om met een inkomen van nul', () => {
    const result = accrueIncome({ ...base, ratePerHour: 0, accruedAt: 0, now: HOUR });
    expect(result.earned).toBe(0);
    expect(result.accruedAt).toBe(HOUR);
    expect(result.secondsUntilFull).toBe(Infinity);
  });

  it('negeert een klok die achteruit is gezet', () => {
    const result = accrueIncome({ ...base, accruedAt: 5 * HOUR, now: HOUR });
    expect(result.earned).toBe(0);
    expect(result.secondsCounted).toBe(0);
  });

  it('rekent uit wanneer de kluis vol zit', () => {
    const result = accrueIncome({ ...base, accruedAt: 0, now: 0, vaultCapacity: 1_000 });
    expect(result.secondsUntilFull).toBeCloseTo(10 * 3_600, 5);
  });
});

describe('levels', () => {
  it('is consistent tussen xpForNextLevel en levelFromTotalXp', () => {
    let total = 0;
    for (let level = 1; level < 20; level++) {
      const progress = levelFromTotalXp(total);
      expect(progress.level).toBe(level);
      expect(progress.xpIntoLevel).toBe(0);
      total += xpForNextLevel(level);
    }
  });

  it('houdt de voortgang binnen een level bij', () => {
    const needed = xpForNextLevel(1);
    const progress = levelFromTotalXp(needed - 1);
    expect(progress.level).toBe(1);
    expect(progress.xpIntoLevel).toBe(needed - 1);
  });

  it('loopt niet voorbij de levelcap', () => {
    const progress = levelFromTotalXp(Number.MAX_SAFE_INTEGER);
    expect(progress.level).toBe(ECONOMY.levelCap);
  });
});

describe('upgradeCost', () => {
  it('groeit exponentieel met het huidige level', () => {
    expect(upgradeCost(1_000, 0)).toBe(1_000);
    expect(upgradeCost(1_000, 1)).toBe(1_150);
    expect(upgradeCost(1_000, 2)).toBe(1_323);
    expect(upgradeCost(1_000, 10)).toBeGreaterThan(upgradeCost(1_000, 9));
  });
});

describe('computeStats', () => {
  const emptyBase = {
    propertyId: 'squat',
    vehicleId: 'on_foot',
    upgrades: {},
    placements: [],
  };

  it('geeft de startwaarden voor een nieuwe speler', () => {
    // Bewust afgeleid uit de definities: anders breekt elke balanswijziging
    // deze test zonder dat er iets kapot is.
    const squat = getProperty('squat');
    const stats = computeStats(emptyBase);
    expect(stats.baseIncomePerHour).toBe(squat.incomePerHour);
    expect(stats.incomePerHour).toBe(squat.incomePerHour);
    expect(stats.inventorySlots).toBe(ECONOMY.baseInventorySlots);
    expect(stats.offlineCapHours).toBe(squat.offlineCapHours);
  });

  it('telt geplaatste items mee voor inkomen en flex', () => {
    // Elk voorwerp is een eigen rij met een eigen plek; twee lampen zijn
    // dus twee regels, niet één regel met aantal 2.
    const stats = computeStats({
      ...emptyBase,
      propertyId: 'townhouse',
      placements: [
        { id: 'a', itemId: 'lamp', x: 0, z: 0, rotation: 0 },
        { id: 'b', itemId: 'lamp', x: 1, z: 0, rotation: 0 },
        { id: 'c', itemId: 'aquarium', x: 2, z: 0, rotation: 0 },
      ],
    });
    const townhouse = getProperty('townhouse');
    const lamp = getItem('lamp');
    const aquarium = getItem('aquarium');
    expect(stats.baseIncomePerHour).toBe(
      townhouse.incomePerHour + (lamp.incomePerHour ?? 0) * 2 + (aquarium.incomePerHour ?? 0),
    );
    expect(stats.flexScore).toBe(townhouse.flex + (lamp.flex ?? 0) * 2 + (aquarium.flex ?? 0));
    expect(stats.incomePerHour).toBeGreaterThan(stats.baseIncomePerHour);
  });

  it('past upgrades, voertuig en boosts toe', () => {
    const stats = computeStats({
      propertyId: 'apartment',
      vehicleId: 'hatchback',
      upgrades: { bookkeeper: 5, backpack: 2, generator: 3, vault: 4, magnet: 2 },
      placements: [{ id: 'a', itemId: 'painting', x: 0, z: 0, rotation: 0 }],
      activeBoostIds: ['coffee'],
    });
    expect(stats.upgradeMultiplier).toBeCloseTo(1.3, 5);
    expect(stats.boostMultiplier).toBeCloseTo(1.25, 5);
    const apartment = getProperty('apartment');
    expect(stats.inventorySlots).toBe(
      ECONOMY.baseInventorySlots + getVehicle('hatchback').carryBonus + 8,
    );
    expect(stats.offlineCapHours).toBe(apartment.offlineCapHours + 3);
    // Kluis-upgrade level 4 = +100%.
    expect(stats.vaultCapacity).toBe(Math.floor(apartment.vaultCapacity * 2));
    expect(stats.pickupRadius).toBeCloseTo(ECONOMY.basePickupRadius + 1.2, 5);
    expect(stats.moveSpeed).toBeCloseTo(ECONOMY.baseMoveSpeed * 2.1, 5);
  });

  it('begrenst upgrades op hun maximum', () => {
    const bookkeeper = BASE_UPGRADES.find((u) => u.id === 'bookkeeper')!;
    const stats = computeStats({ ...emptyBase, upgrades: { bookkeeper: 9_999 } });
    expect(stats.upgradeMultiplier).toBeCloseTo(1 + bookkeeper.maxLevel * bookkeeper.perLevel, 5);
  });

  it('begrenst de flexbonus', () => {
    expect(flexMultiplier(0)).toBe(0);
    expect(flexMultiplier(2_000)).toBeCloseTo(1, 5);
    expect(flexMultiplier(999_999)).toBe(ECONOMY.maxFlexMultiplier);
  });
});

describe('opmaak', () => {
  it('kort grote bedragen af', () => {
    expect(formatMoney(999)).toBe('999');
    expect(formatMoney(1_234)).toBe('1.23K');
    expect(formatMoney(12_345)).toBe('12.3K');
    expect(formatMoney(1_234_567)).toBe('1.23M');
    expect(formatMoney(-4_500)).toBe('-4.50K');
  });

  it('toont leesbare duur', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(3_600 + 720)).toBe('1u 12m');
    expect(formatDuration(Infinity)).toBe('∞');
  });
});
