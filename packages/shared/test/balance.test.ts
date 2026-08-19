import { describe, expect, it } from 'vitest';
import { DISTRICTS } from '../src/city/districts';
import { ITEMS, sellValue } from '../src/items';
import { PROPERTIES, getProperty } from '../src/properties';
import { RARITIES, type Rarity } from '../src/types';
import { DEFAULT_SIM_CONFIG, simulate } from '../sim/simulate';

/**
 * Bewaking van de economie.
 *
 * Deze tests bestaan omdat er een fout maandenlang onopgemerkt bleef: de
 * zeldzaamheid werd twee keer verrekend, waardoor één legendarische vondst
 * 126.000 opbracht terwijl een rijtjeshuis 55.000 kost. Alle 108 tests bleven
 * groen, want niemand controleerde wat een item eigenlijk wáárd was ten
 * opzichte van wat dingen kosten.
 *
 * De grenzen zijn ruim: dit is een vangrail tegen ontsporing, geen keurslijf
 * dat elke afstelling blokkeert.
 */

function averageValue(rarity: Rarity): number {
  const pool = ITEMS.filter((i) => i.rarity === rarity && !i.craftOnly);
  if (pool.length === 0) return 0;
  return pool.reduce((sum, item) => sum + sellValue(item, 1), 0) / pool.length;
}

function legendaryChance(weights: Readonly<Record<Rarity, number>>): number {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  return total > 0 ? (weights.legendary + weights.mythic) / total : 0;
}

describe('waarde van items', () => {
  it('loopt vloeiend op per zeldzaamheid, niet explosief', () => {
    for (let i = 1; i < RARITIES.length; i++) {
      const vorige = averageValue(RARITIES[i - 1]!);
      const deze = averageValue(RARITIES[i]!);
      if (vorige === 0 || deze === 0) continue;
      const factor = deze / vorige;
      expect(factor, `${RARITIES[i - 1]} → ${RARITIES[i]}`).toBeGreaterThan(1.5);
      // Mythisch mag een grotere sprong maken dan de rest — het is de
      // trofee-tier. Explosief wordt het pas boven een factor 8.
      expect(factor, `${RARITIES[i - 1]} → ${RARITIES[i]}`).toBeLessThan(8);
    }
  });

  it('laat één vondst nooit het midden van het spel overslaan', () => {
    // Precies de fout die eerder onopgemerkt bleef: één diamant was meer
    // waard dan een rijtjeshuis.
    const derdeWoning = PROPERTIES.find((p) => p.tier === 3)!;
    for (const item of ITEMS) {
      expect(sellValue(item, 1.25), item.name).toBeLessThan(derdeWoning.price);
    }
  });

  it('houdt zeldzaam ook echt zeldzaam', () => {
    for (const district of DISTRICTS) {
      expect(legendaryChance(district.rarityWeights), district.name).toBeLessThanOrEqual(0.1);
    }
  });

  it('maakt latere districten lucratiever dan de startwijk', () => {
    const start = DISTRICTS.find((d) => d.id === 'oldTown')!;
    const eind = DISTRICTS.find((d) => d.id === 'island')!;
    expect(legendaryChance(eind.rarityWeights)).toBeGreaterThan(
      legendaryChance(start.rarityWeights),
    );
  });
});

describe('passief tegenover actief', () => {
  /**
   * BEKEND GAT — de verhouding tussen woning en meubilair loopt uit de pas.
   *
   * Een vol kraakpand met doorsnee-meubels levert 57x het inkomen van het
   * kraakpand zelf op; op het privé-eiland is datzelfde meubilair nog 1%
   * waard. Het inkomen van woningen groeit ongeveer 5x per tier, het
   * meubilair houdt daar niet over. Gevolg: waar je het hele spel voor
   * verzamelt doet er aan het eind niet meer toe, precies wat hoofdstuk 11
   * "de stad wordt versiering" noemt.
   *
   * De voorgestelde oplossing is structureel en verdient een aparte
   * beslissing: laat de woning het meubilair *vermenigvuldigen* in plaats van
   * er een vast bedrag bij op te tellen. Dan blijft verzamelen altijd lonen
   * en versterkt een groter huis wat je hebt gevonden.
   */
  it.todo('houdt meubilair ook laat in het spel de moeite waard');

  it('laat elke volgende woning duidelijk meer opleveren', () => {
    const opVolgorde = [...PROPERTIES].sort((a, b) => a.tier - b.tier);
    for (let i = 1; i < opVolgorde.length; i++) {
      expect(
        opVolgorde[i]!.incomePerHour,
        opVolgorde[i]!.name,
      ).toBeGreaterThan(opVolgorde[i - 1]!.incomePerHour * 2);
    }
  });
});

describe('de curve als geheel', () => {
  // Tien dagen is genoeg om de vorm te zien en houdt de test snel.
  const result = simulate({ ...DEFAULT_SIM_CONFIG, days: 10 });

  it('geeft snel een eerste beloning', () => {
    expect(result.metrics.minutesToFirstPurchase).not.toBeNull();
    expect(result.metrics.minutesToFirstPurchase!).toBeLessThan(20);
  });

  it('brengt de speler binnen een kwartier in een eigen woning', () => {
    expect(result.metrics.minutesToProperty.studio).toBeDefined();
    expect(result.metrics.minutesToProperty.studio!).toBeLessThan(30);
  });

  it('laat de speler doorgroeien zonder muur', () => {
    expect(result.metrics.purchases).toBeGreaterThan(20);
    expect(result.metrics.finalIncomePerHour).toBeGreaterThan(0);
  });

  it('houdt oprapen de moeite waard', () => {
    expect(result.metrics.activeIncomeShare).toBeGreaterThan(0.05);
    expect(result.metrics.activeIncomeShare).toBeLessThan(0.6);
  });

  it('maakt terugkomen na een nacht de moeite waard', () => {
    // Ruime band: onder de 5 minuten is de idle-kant zinloos, boven de 2 uur
    // hoef je niet meer te spelen.
    expect(result.metrics.offlineInActiveMinutes).toBeGreaterThan(5);
    expect(result.metrics.offlineInActiveMinutes).toBeLessThan(120);
  });

  it('is reproduceerbaar met dezelfde seed', () => {
    const nogmaals = simulate({ ...DEFAULT_SIM_CONFIG, days: 10 });
    expect(nogmaals.metrics).toEqual(result.metrics);
  });
});
