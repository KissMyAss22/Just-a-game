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
  CITY_EAST_EDGE,
  PARK_BOUNDS,
  PARK_CAUSEWAY,
  isParkSide,
  isRoadCell,
  SPECIAL_AREAS,
  specialAreaAt,
  specialAreasIn,
  isWalkable,
  isWaterCell,
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
  ROAD_PERIOD,
  groundHeightAt,
  isAsphalt,
  streetPropsIn,
  treesOnLot,
} from '../src/city/streets';
import { PARK_PATH_PERIOD, PARK_SEED, parkLandIn, parkPropsIn, parkRect } from '../src/city/park';
import { afstandTotRoute, findRoute } from '../src/route';
import { shopSpots } from '../src/shops';

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
    //
    // De test liep eerst alleen langs de cellen die deelbaar zijn door de
    // bloklengte en eiste daar asfalt. Dat klopte zolang het hele raster stad
    // was; nu er een park en een zee in liggen niet meer, want daar zijn die
    // kolommen geen straat. De afspraak is daarom van twee kanten
    // opgeschreven: `isRoadCell` en `isAsphalt` moeten het overal eens zijn.
    for (let cx = 0; cx < CITY.gridSize; cx++) {
      const world = cellToWorld(cx, 64);
      const weg = isRoadCell(cx, 64);
      expect({ cx, asfalt: isAsphalt(world.x, world.z) }).toEqual({ cx, asfalt: weg });
      expect({ cx, hoogte: groundHeightAt(world.x, world.z) }).toEqual({
        cx,
        hoogte: weg ? 0 : SIDEWALK_HEIGHT,
      });
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

  /**
   * Deze test bestaat omdat het mis ging: de prullenbak werd een meter in de
   * kijkrichting van de lantaarn gezet, en die buigt naar de weg toe. Daardoor
   * stond bij élke lantaarn een bak midden op de rijbaan, en de brandkraan
   * schoof altijd in +z ongeacht welke kant de straat op liep. Eén brede
   * steekproef vangt dat allemaal in één keer.
   */
  it('zet alle straatmeubels op de stoep en nooit in een gebouw', () => {
    const props = streetPropsIn(-300, -300, 300, 300).filter((p) => p.kind !== 'car');
    // Alle soorten moeten in de steekproef zitten, anders test hij niets.
    for (const kind of ['lamp', 'bin', 'hydrant', 'bench'] as const) {
      expect(props.filter((p) => p.kind === kind).length).toBeGreaterThan(0);
    }
    for (const prop of props) {
      expect({ kind: prop.kind, asfalt: isAsphalt(prop.x, prop.z) }).toEqual({
        kind: prop.kind,
        asfalt: false,
      });
      const { cx, cz } = worldToCell(prop.x, prop.z);
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
    // Bewust een chunk zonder stadspark of plein erin. Daar ís groen namelijk
    // wél de regel, en dan zegt de vergelijking hieronder niets meer.
    const chunk = buildChunk(6, 6);
    expect(specialAreasIn(
      chunk.centerX - chunk.size / 2,
      chunk.centerZ - chunk.size / 2,
      chunk.centerX + chunk.size / 2,
      chunk.centerZ + chunk.size / 2,
    )).toEqual([]);
    for (const lot of chunk.green) {
      // Op open grond, niet "in een cel zonder pand". Dat verschil is echt:
      // `buildingAtCell` geeft het pérceel terug, en bij een L-vormig hoekpand
      // ligt de binnentuin buiten de voetafdruk maar wél in dat perceel. De
      // vraag die ertoe doet is of je er kunt staan.
      expect({ x: Math.round(lot.x), z: Math.round(lot.z), open: isWalkable(lot.x, lot.z, 0.3) })
        .toEqual({ x: Math.round(lot.x), z: Math.round(lot.z), open: true });
    }
    // Groen is een uitzondering, geen regel: vroeger werd elke lege cel groen.
    expect(chunk.green.length).toBeLessThan(chunk.buildings.length);
  });
});

/**
 * Het Verlaten Park ligt ten oosten van de stad, met één landtong ernaartoe.
 * Als die toegang niet klopt is het gebied of onbereikbaar, of juist overal
 * open — en dan is er geen poort meer waar je buit veilig wordt.
 */
describe('Het Verlaten Park', () => {
  it('laat de stad staan waar hij stond, ook nu het raster groter is', () => {
    // De oorsprong ligt vast op cel 64; groeit het raster, dan komen er cellen
    // bij zónder dat er iets verschuift.
    expect(CITY.originCell).toBe(64);
    expect(cellToWorld(CITY.originCell, CITY.originCell)).toEqual({ x: 4, z: 4 });
    expect(worldToCell(0, 0)).toEqual({ cx: 64, cz: 64 });
    expect(spawnPosition()).toEqual({ x: 4, z: 4 });
  });

  it('maakt het park begaanbaar en de zee eromheen niet', () => {
    // Midden in het park.
    expect(isWaterCell(146, 64)).toBe(false);
    // Ten noorden en ten zuiden ervan is zee.
    expect(isWaterCell(146, 10)).toBe(true);
    expect(isWaterCell(146, 130)).toBe(true);
  });

  it('houdt maar één doorgang open', () => {
    // De landtong zelf is land.
    expect(isWaterCell(129, 61)).toBe(false);
    // Ernaast, in dezelfde strook, is water.
    expect(isWaterCell(129, 50)).toBe(true);
    expect(isWaterCell(129, 70)).toBe(true);
  });

  it('legt geen straten aan in het park', () => {
    for (let cz = 32; cz < 96; cz += 4) {
      for (let cx = 132; cx < 160; cx += 4) {
        expect({ cx, cz, weg: isRoadCell(cx, cz) }).toEqual({ cx, cz, weg: false });
      }
    }
  });

  it('geeft elke cel van het grotere raster precies één wijk', () => {
    for (let cx = 0; cx < CITY.gridSize; cx += 3) {
      for (let cz = 0; cz < CITY.gridSize; cz += 3) {
        const matches = DISTRICTS.filter((d) => {
          const [x0, z0, x1, z1] = d.bounds;
          return cx >= x0 && cx < x1 && cz >= z0 && cz < z1;
        });
        expect({ cx, cz, aantal: matches.length }).toEqual({ cx, cz, aantal: 1 });
      }
    }
  });

  it('kun je vanuit de stad het park in lopen, en weer terug', () => {
    // De test hieronder liep van de landtong naar het park en stond groen —
    // maar hij begon ál op de landtong. De naad tussen de stad en de landtong
    // is nooit getoetst, en daar stond een bouwblok: twee van de vier celrijen
    // van de doorgang zaten dicht. Je kwam er langs als je toevallig de goede
    // rij had. Dit loopt de hele weg, en over alle vier de rijen.
    const loop = (vanCel: number, totCel: number, cz: number): boolean => {
      const start = cellToWorld(vanCel, cz);
      const eind = cellToWorld(totCel, cz);
      const stappen = 60;
      for (let i = 0; i <= stappen; i++) {
        const t = i / stappen;
        if (!isWalkable(start.x + (eind.x - start.x) * t, start.z, 0.45)) return false;
      }
      return true;
    };

    // Elke celrij van de doorgang loopt vanaf de stadsrand het park in.
    for (let cz = PARK_CAUSEWAY.z0; cz < PARK_CAUSEWAY.z1; cz++) {
      expect({ cz, doorlopend: loop(CITY_EAST_EDGE - 2, PARK_BOUNDS.x0 + 2, cz) }).toEqual({
        cz,
        doorlopend: true,
      });
    }

    // En die stadsrand hangt niet in de lucht: minstens één van die rijen loopt
    // door tot diep in de stad. Zonder deze helft zou het bovenstaande alleen
    // bewijzen dat het stukje dat we net vrijhielden vrij is.
    const rijen: number[] = [];
    for (let cz = PARK_CAUSEWAY.z0; cz < PARK_CAUSEWAY.z1; cz++) {
      if (loop(CITY_EAST_EDGE - 8, PARK_BOUNDS.x0 + 2, cz)) rijen.push(cz);
    }
    expect(rijen.length).toBeGreaterThan(0);
  });

  it('kun je vanaf de landtong het park in lopen', () => {
    // Van het midden van de landtong naar het midden van het park moet elke
    // stap over begaanbaar terrein gaan.
    const start = cellToWorld(129, 61);
    const eind = cellToWorld(140, 61);
    const stappen = 30;
    for (let i = 0; i <= stappen; i++) {
      const t = i / stappen;
      const x = start.x + (eind.x - start.x) * t;
      const z = start.z + (eind.z - start.z) * t;
      expect({ i, loopbaar: isWalkable(x, z, 0.45) }).toEqual({ i, loopbaar: true });
    }
  });
});

/**
 * De inboedel van het park.
 *
 * Hier zat de fout die je alleen ziet als je telt. `isRoadCell` gaf in het park
 * netjes `false` en daar stond ook een test op — maar `streetPropsIn` vraagt
 * dat nooit. Die functie rekent met de wegassen, en die lopen gewoon door tot
 * voorbij de oostrand. Resultaat: 444 lantaarns, 130 geparkeerde auto's, 55
 * banken, 50 prullenbakken en 28 brandkranen tussen de bomen, terwijl elke test
 * groen stond.
 */
describe('de inboedel van het park', () => {
  const vak = parkRect();

  it('zet geen enkel stuk straatmeubilair op de parkzijde', () => {
    const props = streetPropsIn(vak.minX - 60, vak.minZ - 60, vak.maxX + 60, vak.maxZ + 60);
    const fout = props.filter((prop) => {
      const cell = worldToCell(prop.x, prop.z);
      return isParkSide(cell.cx, cell.cz);
    });
    // De uitkomst per soort meegeven, want "5 stuks" zegt minder dan "5 lampen".
    const perSoort = fout.reduce<Record<string, number>>((acc, prop) => {
      acc[prop.kind] = (acc[prop.kind] ?? 0) + 1;
      return acc;
    }, {});
    expect(perSoort).toEqual({});
  });

  it('houdt de stad wél aangekleed', () => {
    // Anders slaagt de test hierboven ook als er nergens meer meubilair staat.
    const midden = cellToWorld(64, 64);
    const props = streetPropsIn(midden.x - 120, midden.z - 120, midden.x + 120, midden.z + 120);
    expect(props.filter((prop) => prop.kind === 'lamp').length).toBeGreaterThan(20);
    expect(props.filter((prop) => prop.kind === 'car').length).toBeGreaterThan(5);
  });

  it('legt het park op één vlakke hoogte', () => {
    // Zonder dit stap je elke veertig meter over een stoeprand die er niet is,
    // want "asfalt" was pure rekenkunde op de wegassen.
    const z = cellToWorld(140, 64).z;
    const hoogtes = new Set<number>();
    for (let x = vak.minX; x <= vak.maxX; x += 0.5) hoogtes.add(groundHeightAt(x, z));
    expect([...hoogtes]).toEqual([SIDEWALK_HEIGHT]);
  });

  it('zet parkmeubilair alleen in het park, en alleen waar je kunt lopen', () => {
    const props = parkPropsIn(vak.minX, vak.minZ, vak.maxX, vak.maxZ);
    expect(props.length).toBeGreaterThan(100);
    for (const prop of props) {
      const cell = worldToCell(prop.x, prop.z);
      expect({ kind: prop.kind, park: isParkSide(cell.cx, cell.cz) }).toEqual({
        kind: prop.kind,
        park: true,
      });
      expect({ kind: prop.kind, loopbaar: isWalkable(prop.x, prop.z, 0.2) }).toEqual({
        kind: prop.kind,
        loopbaar: true,
      });
    }
  });

  it('geeft banken en omgevallen palen, niet alleen pad', () => {
    const props = parkPropsIn(vak.minX, vak.minZ, vak.maxX, vak.maxZ);
    const soorten = new Set(props.map((prop) => prop.kind));
    expect([...soorten].sort()).toEqual(['brokenLamp', 'parkBench', 'parkPath']);
  });

  it('geeft bij hetzelfde zaadje hetzelfde park', () => {
    const a = parkPropsIn(560, -40, 700, 120, PARK_SEED);
    const b = parkPropsIn(560, -40, 700, 120, PARK_SEED);
    expect(a).toEqual(b);
    // En een ander zaadje geeft een ander park, anders doet het zaadje niets.
    expect(parkPropsIn(560, -40, 700, 120, PARK_SEED + 1)).not.toEqual(a);
  });

  it('noemt alleen land land, en de zee ertussen niet', () => {
    // Het park lag eerst op stoephoogte door het hele grondvlak van de chunk op
    // te tillen. Dat dekte de zee af: de landtong werd een weiland met gras aan
    // weerszijden. Vandaar dat het land een vorm heeft en geen hoogte.
    const chunk = { minX: 512, minZ: -256, maxX: 640, maxZ: -128 };
    const land = parkLandIn(chunk.minX, chunk.minZ, chunk.maxX, chunk.maxZ);
    expect(land.length).toBeGreaterThan(0);
    for (const rect of land) {
      // Elke hoek van elk stuk land ligt aan de parkzijde, en nergens in zee.
      for (const x of [rect.minX + 0.1, rect.maxX - 0.1]) {
        for (const z of [rect.minZ + 0.1, rect.maxZ - 0.1]) {
          const cell = worldToCell(x, z);
          expect({ x, z, park: isParkSide(cell.cx, cell.cz) }).toEqual({ x, z, park: true });
        }
      }
      // En het blijft binnen het gevraagde vak, anders steekt het de buurchunk in.
      expect(rect.minX).toBeGreaterThanOrEqual(chunk.minX);
      expect(rect.maxX).toBeLessThanOrEqual(chunk.maxX);
    }
  });

  it('geeft geen land terug waar alleen stad of zee ligt', () => {
    expect(parkLandIn(-100, -100, 100, 100)).toEqual([]);
    // Pal ten noorden van het park: daar is het open zee.
    const noord = cellToWorld(146, 10);
    expect(parkLandIn(noord.x - 20, noord.z - 20, noord.x + 20, noord.z + 20)).toEqual([]);
  });

  it('legt de paden niet op het oude stratenraster', () => {
    // Zou de padafstand gelijk zijn aan `ROAD_PERIOD` — of een veelvoud of een
    // deler daarvan — dan volgen de paden precies de oude straatassen en heb je
    // het stratenpatroon terug dat we hier net weggehaald hebben, alleen dan in
    // grind. Dit is de reden dat het 34 meter is en geen 40.
    expect(PARK_PATH_PERIOD).not.toBe(ROAD_PERIOD);
    expect(ROAD_PERIOD % PARK_PATH_PERIOD).not.toBe(0);
    expect(PARK_PATH_PERIOD % ROAD_PERIOD).not.toBe(0);
  });
});

/**
 * De route die je op straat als lijn voor je ziet.
 *
 * De pijl in de HUD wees alleen een richting; hij hield geen rekening met
 * gebouwen, dus hij wees net zo vrolijk dwars door een bouwblok. Een lijn moet
 * wél te belopen zijn, en dat is precies wat hier getoetst wordt.
 */
describe('een route om te volgen', () => {
  const start = spawnPosition();

  it('brengt je naar elk pandjeshuis, over begaanbaar terrein', () => {
    for (const winkel of shopSpots()) {
      const route = findRoute(start, { x: winkel.x, z: winkel.z });
      expect({ winkel: winkel.id, bereikbaar: route.bereikbaar }).toEqual({
        winkel: winkel.id,
        bereikbaar: true,
      });
      // Elk stuk tussen twee knikpunten moet over land lopen. Zonder deze
      // controle kun je een route hebben die er goed uitziet en waar je
      // halverwege tegen een gevel staat.
      for (let i = 1; i < route.punten.length; i++) {
        const a = route.punten[i - 1]!;
        const b = route.punten[i]!;
        for (let t = 0; t <= 1; t += 0.05) {
          const x = a.x + (b.x - a.x) * t;
          const z = a.z + (b.z - a.z) * t;
          expect({ winkel: winkel.id, loopbaar: isWalkable(x, z, 0.4) }).toEqual({
            winkel: winkel.id,
            loopbaar: true,
          });
        }
      }
    }
  });

  it('vindt de weg naar het park, over de landtong', () => {
    const park = cellToWorld(PARK_BOUNDS.x0 + 14, 64);
    const route = findRoute(start, park);
    expect(route.bereikbaar).toBe(true);
    // De enige doorgang is de landtong, dus de route moet er langs. Let op:
    // aftasten en niet naar de knikpunten kijken — de landtong is een recht
    // stuk, dus `vereenvoudig` haalt daar juist alle punten weg.
    let overDeLandtong = false;
    for (let i = 1; i < route.punten.length && !overDeLandtong; i++) {
      const a = route.punten[i - 1]!;
      const b = route.punten[i]!;
      for (let t = 0; t <= 1; t += 0.02) {
        const cel = worldToCell(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
        if (cel.cx >= PARK_CAUSEWAY.x0 && cel.cx < PARK_CAUSEWAY.x1) {
          overDeLandtong = true;
          break;
        }
      }
    }
    expect(overDeLandtong).toBe(true);
  });

  it('zegt eerlijk dat het privé-eiland niet te belopen is', () => {
    // Het eiland ligt los in zee en er is nog geen boot. Een lijn het water op
    // trekken zou er goed uitzien en nergens toe leiden.
    const eiland = cellToWorld(20, 111);
    const route = findRoute(start, eiland);
    expect(route.bereikbaar).toBe(false);
  });

  it('meet hoe ver je van de lijn af bent', () => {
    const route = findRoute(start, { x: start.x + 200, z: start.z });
    expect(afstandTotRoute(route, start)).toBeCloseTo(0, 1);
    expect(afstandTotRoute(route, { x: start.x + 100, z: start.z + 30 })).toBeGreaterThan(20);
  });
});


/**
 * Het stadspark en het marktplein: plekken in de stad die geen bouwblok zijn.
 *
 * De stad is verder overal hetzelfde raster, en dat maakte dat een winkel
 * nergens hóórde — hij werd met een ringzoeker tegen de eerste de beste gevel
 * gezet. Deze twee vakken zijn wél gekozen. Wat hieronder getoetst wordt is niet
 * of ze er zijn maar of ze *gaten* zijn: geen straat, geen pand, geen stoeprand
 * en geen straatmeubilair — en de straten eromheen nog wel, want een vak dat de
 * hele buurt platlegt is net zo fout als geen vak.
 */
describe('bijzondere gebieden', () => {
  it('legt er geen straat aan en zet er geen pand neer', () => {
    for (const vak of SPECIAL_AREAS) {
      for (let cx = vak.x0; cx < vak.x1; cx++) {
        for (let cz = vak.z0; cz < vak.z1; cz++) {
          expect({
            vak: vak.id,
            cel: `${cx},${cz}`,
            weg: isRoadCell(cx, cz),
            pand: buildingAtCell(cx, cz) !== null,
          }).toEqual({ vak: vak.id, cel: `${cx},${cz}`, weg: false, pand: false });
        }
      }
    }
  });

  it('laat de straten eromheen gewoon liggen', () => {
    // De cellen net buiten het vak zijn de omringende straten. Zou een vak die
    // ook opslokken, dan lag er een gat in het stratennet en kwam je er niet meer
    // langs.
    for (const vak of SPECIAL_AREAS) {
      expect({ vak: vak.id, west: isRoadCell(vak.x0 - 1, vak.z0 + 2) }).toEqual({
        vak: vak.id,
        west: true,
      });
      expect({ vak: vak.id, oost: isRoadCell(vak.x1, vak.z0 + 2) }).toEqual({
        vak: vak.id,
        oost: true,
      });
    }
  });

  /**
   * Dit is letterlijk de fout die het oostelijke park al een keer had: `isAsphalt`
   * volgde `isRoadCell` niet, en dan stap je elke veertig meter over een
   * stoeprand die er niet is. Items, personages en voertuigen gebruiken diezelfde
   * `groundHeightAt`, dus het zweeft allemaal mee.
   */
  it('houdt de grond er vlak — geen onzichtbare stoepranden', () => {
    for (const vak of SPECIAL_AREAS) {
      const hoogtes = new Set<number>();
      for (let cx = vak.x0; cx < vak.x1; cx++) {
        for (let cz = vak.z0; cz < vak.z1; cz++) {
          const wereld = cellToWorld(cx, cz);
          hoogtes.add(Math.round(groundHeightAt(wereld.x, wereld.z) * 1000));
        }
      }
      // Eén hoogte over het hele vak, en verder niets.
      expect({ vak: vak.id, verschillendeHoogtes: hoogtes.size }).toEqual({
        vak: vak.id,
        verschillendeHoogtes: 1,
      });
    }
  });

  it('zet er geen lantaarns, banken of geparkeerde auto\'s neer', () => {
    // Hetzelfde vangnet dat 707 stuks straatmeubilair uit het oostelijke park
    // hield. `streetPropsIn` bouwt zijn rijen uit de wegassen, en die lopen
    // gewoon door een park heen; alleen het eindfilter houdt ze tegen.
    for (const vak of SPECIAL_AREAS) {
      const west = cellToWorld(vak.x0, vak.z0);
      const oost = cellToWorld(vak.x1 - 1, vak.z1 - 1);
      const props = streetPropsIn(west.x, west.z, oost.x, oost.z).filter((prop) => {
        const cel = worldToCell(prop.x, prop.z);
        return specialAreaAt(cel.cx, cel.cz)?.id === vak.id;
      });
      expect({ vak: vak.id, meubilair: props.length }).toEqual({ vak: vak.id, meubilair: 0 });
    }
  });
});
