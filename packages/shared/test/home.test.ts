import { describe, expect, it } from 'vitest';
import { computeStats } from '../src/economy';
import {
  DECORATION_BONUS_CAP,
  FLOOR_PLANS,
  cellsFor,
  checkPlacement,
  decorationBonus,
  doorCell,
  findFreeSpot,
  floorPlanFor,
  homeCellToWorld,
  itemFootprint,
  itemHeight,
  occupiedCells,
  PLACEMENT_PROBLEM_MESSAGE,
  placeableCells,
  placedItemCenter,
  propertySlots,
  rotatedFootprint,
  worldToHomeCell,
  type PlacedItem,
} from '../src/home';
import { ITEMS, getItem } from '../src/items';
import { PROPERTIES } from '../src/properties';

const plan = floorPlanFor('townhouse'); // 4 x 3

function placed(id: string, itemId: string, x: number, z: number, rotation = 0): PlacedItem {
  return { id, itemId, x, z, rotation };
}

describe('plattegronden', () => {
  it('bestaat voor elke woning', () => {
    for (const property of PROPERTIES) {
      expect(FLOOR_PLANS[property.id], property.id).toBeDefined();
      expect(propertySlots(property.id), property.id).toBeGreaterThan(0);
    }
  });

  it('groeit met de tier van de woning', () => {
    const slots = PROPERTIES.map((p) => propertySlots(p.id));
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i]!, PROPERTIES[i]!.id).toBeGreaterThan(slots[i - 1]!);
    }
  });

  it('houdt de deur vrij', () => {
    expect(placeableCells(plan)).toBe(plan.width * plan.depth - 1);
    const door = doorCell(plan);
    expect(door.z).toBe(plan.depth - 1);
  });
});

describe('afmetingen en draaien', () => {
  it('geeft standaard één cel', () => {
    expect(itemFootprint('lamp')).toEqual({ w: 1, d: 1 });
  });

  it('wisselt breedte en diepte bij een kwartslag', () => {
    expect(rotatedFootprint('aquarium', 0)).toEqual({ w: 2, d: 1 });
    expect(rotatedFootprint('aquarium', 1)).toEqual({ w: 1, d: 2 });
    expect(rotatedFootprint('aquarium', 2)).toEqual({ w: 2, d: 1 });
    expect(rotatedFootprint('aquarium', 3)).toEqual({ w: 1, d: 2 });
  });

  it('somt de juiste cellen op', () => {
    expect(cellsFor('piano', 1, 1, 0)).toEqual([
      { x: 1, z: 1 },
      { x: 2, z: 1 },
      { x: 1, z: 2 },
      { x: 2, z: 2 },
    ]);
  });

  it('geeft elk plaatsbaar item een stabiele hoogte', () => {
    for (const item of ITEMS) {
      if (!item.incomePerHour && !item.flex) continue;
      const h = itemHeight(item.id);
      expect(h, item.id).toBeGreaterThan(0);
      expect(itemHeight(item.id)).toBe(h);
    }
  });
});

describe('mag het hier staan', () => {
  it('accepteert een lege plek', () => {
    expect(checkPlacement(plan, [], 'lamp', 0, 0, 0)).toEqual({ ok: true });
  });

  it('weigert buiten de muren', () => {
    expect(checkPlacement(plan, [], 'lamp', plan.width, 0, 0)).toEqual({
      ok: false,
      problem: 'outside',
    });
    expect(checkPlacement(plan, [], 'lamp', -1, 0, 0)).toEqual({ ok: false, problem: 'outside' });
    // Een 2x1 die net buiten de rand steekt.
    expect(checkPlacement(plan, [], 'aquarium', plan.width - 1, 0, 0)).toEqual({
      ok: false,
      problem: 'outside',
    });
  });

  it('weigert de deurcel', () => {
    const door = doorCell(plan);
    expect(checkPlacement(plan, [], 'lamp', door.x, door.z, 0)).toEqual({
      ok: false,
      problem: 'blocks_door',
    });
  });

  it('weigert overlap, ook met een groot voorwerp', () => {
    const bestaand = [placed('a', 'piano', 0, 0, 0)]; // bezet (0,0),(1,0),(0,1),(1,1)
    expect(checkPlacement(plan, bestaand, 'lamp', 1, 1, 0)).toEqual({
      ok: false,
      problem: 'overlaps',
    });
    expect(checkPlacement(plan, bestaand, 'lamp', 2, 0, 0)).toEqual({ ok: true });
  });

  it('laat een voorwerp zichzelf niet in de weg zitten bij verplaatsen', () => {
    const bestaand = [placed('a', 'aquarium', 0, 0, 0)];
    // Zonder ignoreId botst hij met zijn eigen oude plek.
    expect(checkPlacement(plan, bestaand, 'aquarium', 1, 0, 0).ok).toBe(false);
    expect(checkPlacement(plan, bestaand, 'aquarium', 1, 0, 0, 'a').ok).toBe(true);
  });

  it('weigert items die niet in een base horen', () => {
    expect(checkPlacement(plan, [], 'scrap', 0, 0, 0)).toEqual({
      ok: false,
      problem: 'not_placeable',
    });
  });
});

describe('vrije plek zoeken', () => {
  it('vindt de eerste vrije cel', () => {
    expect(findFreeSpot(plan, [], 'lamp')).toEqual({ x: 0, z: 0, rotation: 0 });
  });

  it('slaat bezette cellen over', () => {
    const spot = findFreeSpot(plan, [placed('a', 'lamp', 0, 0)], 'lamp');
    expect(spot).toEqual({ x: 1, z: 0, rotation: 0 });
  });

  it('draait als het rechtop wel past', () => {
    const smal = floorPlanFor('squat'); // 2 x 2, deur op (1,1)
    // Een 2x1 past liggend op rij 0.
    expect(findFreeSpot(smal, [], 'aquarium')).toEqual({ x: 0, z: 0, rotation: 0 });
  });

  it('geeft null als er niets meer past', () => {
    const smal = floorPlanFor('squat');
    const vol = [placed('a', 'lamp', 0, 0), placed('b', 'lamp', 1, 0), placed('c', 'lamp', 0, 1)];
    expect(findFreeSpot(smal, vol, 'lamp')).toBeNull();
  });
});

describe('inrichtingsbonus', () => {
  it('is nul in een lege kamer', () => {
    expect(decorationBonus(plan, [])).toBe(0);
  });

  it('groeit met hoe vol de kamer staat', () => {
    const weinig = decorationBonus(plan, [placed('a', 'lamp', 0, 0)]);
    const meer = decorationBonus(plan, [
      placed('a', 'lamp', 0, 0),
      placed('b', 'lamp', 1, 0),
      placed('c', 'piano', 2, 0),
    ]);
    expect(meer).toBeGreaterThan(weinig);
  });

  it('is begrensd', () => {
    const alles = Array.from({ length: 40 }, (_, i) => placed(`x${i}`, 'lamp', 0, 0));
    expect(decorationBonus(plan, alles)).toBe(DECORATION_BONUS_CAP);
  });

  it('telt de cellen van grote voorwerpen mee', () => {
    expect(occupiedCells([placed('a', 'piano', 0, 0)])).toBe(4);
    expect(occupiedCells([placed('a', 'aquarium', 0, 0, 1)])).toBe(2);
  });

  it('werkt door in je inkomen', () => {
    const leeg = computeStats({
      propertyId: 'townhouse',
      vehicleId: 'on_foot',
      upgrades: {},
      placements: [],
    });
    const gevuld = computeStats({
      propertyId: 'townhouse',
      vehicleId: 'on_foot',
      upgrades: {},
      placements: Array.from({ length: 8 }, (_, i) =>
        placed(`p${i}`, 'lamp', i % 4, Math.floor(i / 4)),
      ),
    });
    expect(gevuld.decorationBonus).toBeGreaterThan(0);
    expect(leeg.decorationBonus).toBe(0);
    expect(gevuld.slots).toBe(propertySlots('townhouse'));
  });
});

describe('van cel naar wereld', () => {
  it('is heen en weer consistent', () => {
    for (let z = 0; z < plan.depth; z++) {
      for (let x = 0; x < plan.width; x++) {
        const world = homeCellToWorld(plan, x, z);
        expect(worldToHomeCell(plan, world.x, world.z)).toEqual({ x, z });
      }
    }
  });

  it('geeft null buiten de kamer', () => {
    expect(worldToHomeCell(plan, 999, 0)).toBeNull();
    expect(worldToHomeCell(plan, 0, -999)).toBeNull();
  });

  it('zet een groot voorwerp tussen zijn cellen in', () => {
    const midden = placedItemCenter(plan, placed('a', 'aquarium', 0, 0, 0));
    const linksCel = homeCellToWorld(plan, 0, 0);
    const rechtsCel = homeCellToWorld(plan, 1, 0);
    expect(midden.x).toBeCloseTo((linksCel.x + rechtsCel.x) / 2, 6);
    expect(midden.width).toBeCloseTo(2 * 1.2, 6);
  });
});

describe('items die je kunt plaatsen', () => {
  it('hebben allemaal inkomen of flex', () => {
    for (const item of ITEMS) {
      const placeable = Boolean(item.incomePerHour || item.flex);
      const result = checkPlacement(plan, [], item.id, 0, 0, 0);
      expect(result.ok, item.id).toBe(placeable);
    }
  });

  it('passen allemaal in de grootste woning', () => {
    const groot = floorPlanFor('island_estate');
    for (const item of ITEMS) {
      if (!item.incomePerHour && !item.flex) continue;
      expect(findFreeSpot(groot, [], item.id), getItem(item.id).name).not.toBeNull();
    }
  });

  it('past een vleugel bewust niet in een kraakpand', () => {
    // Dit is geen bug maar het ontwerp: groot meubilair vraagt een grotere
    // woning. Wel moet de speler een begrijpelijke reden terugkrijgen.
    const smal = floorPlanFor('squat');
    expect(findFreeSpot(smal, [], 'piano')).toBeNull();

    // Waar precies hij vastloopt hangt af van de hoek; belangrijk is dat er
    // altijd een uitlegbare reden uit komt in plaats van een stille weigering.
    const result = checkPlacement(smal, [], 'piano', 0, 0, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(PLACEMENT_PROBLEM_MESSAGE[result.problem]).toBeTruthy();
    }
  });

  it('past alles van één cel wel in een kraakpand', () => {
    const smal = floorPlanFor('squat');
    for (const item of ITEMS) {
      if (!item.incomePerHour && !item.flex) continue;
      const { w, d } = rotatedFootprint(item.id, 0);
      if (w * d > 1) continue;
      expect(findFreeSpot(smal, [], item.id), getItem(item.id).name).not.toBeNull();
    }
  });
});
