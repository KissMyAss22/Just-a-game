import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/rng';
import { DISTRICTS, FACADE_CODE } from '../src/city/districts';
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
  lotCenter,
  lotFrontage,
  lotSize,
  resolveMovement,
  spawnPosition,
  worldToCell,
} from '../src/city/layout';
import {
  ASPHALT_HALF_WIDTH,
  SIDEWALK_HEIGHT,
  groundHeightAt,
  isAsphalt,
  streetPropsIn,
  treesOnLot,
} from '../src/city/streets';

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

describe('straatprofiel', () => {
  it('legt het rijdek precies op de cellen die een weg zijn', () => {
    // Dit is de afspraak die ooit stilzwijgend brak toen de bloklengte
    // veranderde: de as van de straat moet samenvallen met de wegcellen.
    for (let cx = 0; cx < CITY.gridSize; cx++) {
      const world = cellToWorld(cx, 64);
      if (cx % CITY.blockSize !== 0) continue;
      expect(isAsphalt(world.x, world.z)).toBe(true);
      expect(groundHeightAt(world.x, world.z)).toBe(0);
    }
  });

  it('legt de stoep hoger dan het rijdek, midden op het blok', () => {
    const midden = cellToWorld(3, 3);
    expect(isAsphalt(midden.x, midden.z)).toBe(false);
    expect(groundHeightAt(midden.x, midden.z)).toBe(SIDEWALK_HEIGHT);
  });

  it('houdt het rijdek smaller dan de wegcel, zodat er stoep overblijft', () => {
    expect(ASPHALT_HALF_WIDTH).toBeLessThan(CITY.cellSize / 2);
  });

  it('zet lantaarns op de stoep en nooit in een gebouw', () => {
    const props = streetPropsIn(-100, -100, 100, 100);
    const lampen = props.filter((p) => p.kind === 'lamp');
    expect(lampen.length).toBeGreaterThan(0);
    for (const lamp of lampen) {
      expect(isAsphalt(lamp.x, lamp.z)).toBe(false);
      const { cx, cz } = worldToCell(lamp.x, lamp.z);
      expect(buildingAtCell(cx, cz)).toBeNull();
    }
  });

  it('zet geparkeerde autos op het rijdek', () => {
    const autos = streetPropsIn(-100, -100, 100, 100).filter((p) => p.kind === 'car');
    expect(autos.length).toBeGreaterThan(0);
    for (const auto of autos) expect(isAsphalt(auto.x, auto.z)).toBe(true);
  });

  it('geeft bij dezelfde rechthoek altijd dezelfde straat', () => {
    const a = streetPropsIn(0, 0, 128, 128);
    const b = streetPropsIn(0, 0, 128, 128);
    expect(a).toEqual(b);
  });

  it('plant bomen binnen het perceel waar ze bij horen', () => {
    const bomen = treesOnLot(100, 200, 14.7);
    expect(bomen.length).toBeGreaterThan(0);
    for (const boom of bomen) {
      expect(Math.abs(boom.x - 100)).toBeLessThanOrEqual(14.7 / 2);
      expect(Math.abs(boom.z - 200)).toBeLessThanOrEqual(14.7 / 2);
    }
  });
});

describe('gebouwvormen', () => {
  it('geeft elk pand een geldige gevelsoort en een dak dat past bij de hoogte', () => {
    const chunk = buildChunk(4, 4);
    for (const lot of chunk.buildings) {
      expect(Object.values(FACADE_CODE)).toContain(lot.facadeCode);
      expect(lot.roofColor).toMatch(/^#[0-9a-f]{6}$/i);
      // Alleen echt hoge panden springen terug.
      if (lot.setback > 0) expect(lot.floors).toBeGreaterThanOrEqual(12);
      if (lot.floors < 3) expect(lot.roofUnits).toBe(0);
    }
  });

  it('laat panden binnen hun eigen perceel staan', () => {
    const chunk = buildChunk(4, 4);
    for (const lot of chunk.buildings) {
      const center = lotCenter(lot.anchorX, lot.anchorZ);
      const span = lotSize(lot.anchorX, lot.anchorZ);
      const overhangX = Math.abs(lot.centerX - center.x) + lot.width / 2;
      const overhangZ = Math.abs(lot.centerZ - center.z) + lot.depth / 2;
      // Buren raken elkaar met een minieme overlap; verder mag er niets over
      // de perceelgrens steken, want daarachter begint de stoep.
      expect(overhangX).toBeLessThanOrEqual((span.cellsX * CITY.cellSize) / 2 + 0.05);
      expect(overhangZ).toBeLessThanOrEqual((span.cellsZ * CITY.cellSize) / 2 + 0.05);
    }
  });

  it('bebouwt beide kanten van elke straat', () => {
    // Zonder een perceelrij tegen de volgende straat aan zou elke straat maar
    // aan één kant een gevelwand hebben.
    const chunk = buildChunk(4, 4);
    const west = chunk.buildings.filter((b) => lotFrontage(b.anchorX, b.anchorZ).west);
    const oost = chunk.buildings.filter((b) => lotFrontage(b.anchorX, b.anchorZ).east);
    expect(west.length).toBeGreaterThan(0);
    expect(oost.length).toBeGreaterThan(0);
  });

  it('maakt van een hoekpand een L, zodat het blok op de hoek dichtloopt', () => {
    const chunk = buildChunk(4, 4);
    const hoeken = chunk.buildings.filter((b) => lotFrontage(b.anchorX, b.anchorZ).corner);
    expect(hoeken.length).toBeGreaterThan(0);
    // Lage hoekpanden krijgen twee vleugels; een toren vult het perceel zelf.
    const rijtjes = hoeken.filter((b) => b.floors < 9);
    expect(rijtjes.length).toBeGreaterThan(0);
    for (const lot of rijtjes) expect(lot.wing).toBeDefined();
  });

  it('houdt midden in elk bouwblok ruimte over voor een binnentuin', () => {
    // Het hart van een blok moet begaanbaar blijven. Bouwden de vleugels tot
    // achteraan door, dan werd elk blok één massief blok beton.
    const chunk = buildChunk(4, 4);
    let tuinen = 0;
    for (let blok = 0; blok < 3; blok++) {
      const cel = 4 * CITY.chunkSize + blok * CITY.blockSize + Math.floor(CITY.blockSize / 2) + 1;
      const midden = cellToWorld(cel, cel);
      if (isWalkable(midden.x, midden.z, 0.45)) tuinen++;
    }
    expect(tuinen).toBeGreaterThan(0);
    expect(chunk.buildings.length).toBeGreaterThan(0);
  });

  it('zet groen alleen op onbebouwde percelen', () => {
    const chunk = buildChunk(4, 4);
    for (const lot of chunk.green) {
      const { cx, cz } = worldToCell(lot.x, lot.z);
      expect(buildingAtCell(cx, cz)).toBeNull();
    }
    // Groen is een uitzondering, geen regel: vroeger werd elke lege cel groen.
    expect(chunk.green.length).toBeLessThan(chunk.buildings.length);
  });
});
