import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/rng';
import { DISTRICTS } from '../src/city/districts';
import {
  CHUNKS_PER_AXIS,
  CITY,
  buildChunk,
  buildingAtCell,
  cellToWorld,
  chunksAround,
  districtAt,
  findSpawnPoint,
  isWalkable,
  resolveMovement,
  spawnPosition,
  worldToCell,
} from '../src/city/layout';

describe('coördinaten', () => {
  it('is heen en weer consistent', () => {
    for (const [cx, cz] of [[0, 0], [64, 64], [127, 127], [13, 99]] as const) {
      const world = cellToWorld(cx, cz);
      const back = worldToCell(world.x, world.z);
      expect(back).toEqual({ cx, cz });
    }
  });
});

describe('districten', () => {
  it('dekt elke cel van het grid precies één keer', () => {
    for (let cz = 0; cz < CITY.gridSize; cz += 1) {
      for (let cx = 0; cx < CITY.gridSize; cx += 1) {
        const matches = DISTRICTS.filter((d) => {
          const [x0, z0, x1, z1] = d.bounds;
          return cx >= x0 && cx < x1 && cz >= z0 && cz < z1;
        });
        expect(matches.length, `cel ${cx},${cz}`).toBe(1);
      }
    }
  });

  it('geeft de Oude Stad terug op het startpunt', () => {
    expect(districtAt(64, 64).id).toBe('oldTown');
  });
});

describe('stadsgeneratie', () => {
  it('is deterministisch: dezelfde cel geeft altijd hetzelfde gebouw', () => {
    for (const [cx, cz] of [[41, 47], [70, 70], [100, 60]] as const) {
      const a = buildingAtCell(cx, cz);
      const b = buildingAtCell(cx, cz);
      expect(a).toEqual(b);
    }
  });

  it('zet nooit een gebouw op een weg', () => {
    for (let c = 0; c < CITY.gridSize; c += CITY.blockSize) {
      expect(buildingAtCell(c, 44)).toBeNull();
      expect(buildingAtCell(44, c)).toBeNull();
    }
  });

  it('deelt één perceel over meerdere cellen', () => {
    const a = buildingAtCell(41, 49);
    if (a) {
      const b = buildingAtCell(42, 49);
      // Cel 41 en 42 horen bij hetzelfde perceel (anker 41).
      expect(b?.anchorX).toBe(a.anchorX);
      expect(b?.anchorZ).toBe(a.anchorZ);
    }
  });

  it('bouwt chunks met inhoud en zonder dubbele gebouwen', () => {
    const chunk = buildChunk(4, 4);
    expect(chunk.buildings.length).toBeGreaterThan(0);
    const keys = chunk.buildings.map((b) => `${b.anchorX}:${b.anchorZ}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const building of chunk.buildings) {
      expect(building.height).toBeGreaterThan(0);
      expect(building.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('levert alleen chunks binnen de stadsgrenzen', () => {
    const corner = chunksAround(-CITY.gridSize * CITY.cellSize, -CITY.gridSize * CITY.cellSize, 2);
    for (const { chunkX, chunkZ } of corner) {
      expect(chunkX).toBeGreaterThanOrEqual(0);
      expect(chunkZ).toBeGreaterThanOrEqual(0);
      expect(chunkX).toBeLessThan(CHUNKS_PER_AXIS);
      expect(chunkZ).toBeLessThan(CHUNKS_PER_AXIS);
    }
  });
});

describe('begaanbaarheid', () => {
  it('laat de speler op zijn startpositie staan', () => {
    const start = spawnPosition();
    expect(isWalkable(start.x, start.z)).toBe(true);
  });

  it('blokkeert het midden van een gebouw', () => {
    let tested = 0;
    for (let cx = 41; cx < 80 && tested < 5; cx++) {
      const lot = buildingAtCell(cx, 49);
      if (!lot) continue;
      expect(isWalkable(lot.centerX, lot.centerZ)).toBe(false);
      tested++;
    }
    expect(tested).toBeGreaterThan(0);
  });

  it('blokkeert water', () => {
    expect(isWalkable(0, (127 - 64) * CITY.cellSize)).toBe(false);
  });

  it('glijdt langs een muur in plaats van vast te lopen', () => {
    const start = spawnPosition();
    const moved = resolveMovement(start.x, start.z, start.x + 400, start.z, 0.45);
    // De speler mag nooit ín een gebouw eindigen.
    expect(isWalkable(moved.x, moved.z)).toBe(true);
  });
});

describe('spawnpunten', () => {
  it('vindt begaanbare punten in elk district', () => {
    for (const district of DISTRICTS) {
      const next = mulberry32(district.id.length * 7919 + 13);
      const point = findSpawnPoint(district.id, next, 256);
      expect(point, `geen spawnpunt in ${district.id}`).not.toBeNull();
      if (point) {
        expect(isWalkable(point.x, point.z, 0.6)).toBe(true);
        expect(districtAt(point.cx, point.cz).id).toBe(district.id);
      }
    }
  });

  it('is reproduceerbaar met dezelfde seed', () => {
    const a = findSpawnPoint('oldTown', mulberry32(42));
    const b = findSpawnPoint('oldTown', mulberry32(42));
    expect(a).toEqual(b);
  });
});
