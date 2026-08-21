/**
 * De stadsplattegrond, één keer getekend uit de stadsdata.
 *
 * Waarom een plaat en geen live tekening: een echte plattegrond heeft straten,
 * bouwblokken, een kustlijn en panden — tienduizenden vormen. React Native
 * tekent die als losse Views, en een paar honderd is al veel. De stad is
 * deterministisch (`CITY.seed`), dus hij verandert nooit terwijl je speelt en
 * een plaat ervan kan tijdens het spelen niet verouderen.
 *
 * Alles komt uit dezelfde functies als de 3D-wereld. De kaart kán dus niet
 * afwijken van waar je loopt — en dat was precies de klacht.
 */
import {
  ASPHALT_HALF_WIDTH,
  CITY,
  DISTRICTS_BY_ID,
  PARK_BOUNDS,
  buildChunk,
  buildingAtCell,
  cellToWorld,
  districtAt,
  isParkCell,
  isRoadCell,
  isWaterCell,
  specialAreaAt,
  lotAnchor,
  PARK_PATH_SIZE,
  parkPropsIn,
  parkRect,
  type BuildingLot,
} from '@game/shared';

/** Hoeveel pixels één meter wordt. 1,6 is ruim genoeg voor een pand van vier meter. */
const PER_METER = 1.6;
const SPAN_METERS = CITY.gridSize * CITY.cellSize;
export const MAP_SIZE = Math.round(SPAN_METERS * PER_METER);

const canvas = document.getElementById('kaart') as HTMLCanvasElement;
canvas.width = MAP_SIZE;
canvas.height = MAP_SIZE;
const ctx = canvas.getContext('2d')!;

/** Van wereldmeters naar kaartpixels. De oorsprong ligt op cel `originCell`. */
function px(world: number): number {
  return (world + CITY.originCell * CITY.cellSize) * PER_METER;
}

/** Een kleur oplichten of dimmen; de wijkkleuren zijn gemaakt voor 3D-licht. */
function tint(hex: string, factor: number): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((n & 255) * factor));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * De kleuren van de kaart, niet die van de 3D-wereld.
 *
 * Een plattegrond leest op contrast tussen bebouwd en onbebouwd, en de
 * wijkkleuren zijn gemaakt om ónder een zon te liggen. Straatniveau wordt
 * daarom licht en de panden juist donker: dan zie je de bouwblokken en de
 * straten ertussen in één oogopslag, ook als je uitgezoomd bent.
 */
const KLEUR = {
  zee: '#12293a',
  ondiep: '#17364a',
  asfalt: '#23262c',
  belijning: 'rgba(228, 232, 238, 0.30)',
  gevel: '#5d5850',
  gevelrand: '#4a463f',
  groen: '#41613a',
  parkgras: '#41582f',
  pad: '#7d7767',
  bestrating: '#8e8878',
} as const;

// ---------------------------------------------------------------------------
// 1. Zee, en daarop het land per cel in de kleur van zijn wijk.
// ---------------------------------------------------------------------------
ctx.fillStyle = KLEUR.zee;
ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

const cel = CITY.cellSize * PER_METER;
for (let cz = 0; cz < CITY.gridSize; cz++) {
  for (let cx = 0; cx < CITY.gridSize; cx++) {
    if (isWaterCell(cx, cz)) continue;
    const wereld = cellToWorld(cx, cz);
    const x = px(wereld.x) - cel / 2;
    const y = px(wereld.z) - cel / 2;
    // Het park is gras; de rest krijgt de tint van zijn wijk, wat opgelicht
    // omdat die kleuren gemaakt zijn om onder een 3D-zon te liggen.
    // Het stadspark en het marktplein hebben hun eigen grond: zonder dit zijn
    // het gaten in het bouwblokkenpatroon in plaats van herkenbare plekken.
    const vak = specialAreaAt(cx, cz);
    ctx.fillStyle =
      isParkCell(cx, cz) || vak?.kind === 'park'
        ? KLEUR.parkgras
        : vak
          ? KLEUR.bestrating
          : tint(districtAt(cx, cz).groundColor, 2.45);
    ctx.fillRect(x, y, cel + 1, cel + 1);
  }
}

// Een lichte zoom langs de kust, zodat de waterlijn leest als een kustlijn.
ctx.strokeStyle = KLEUR.ondiep;
ctx.lineWidth = 3;
for (let cz = 0; cz < CITY.gridSize; cz++) {
  for (let cx = 0; cx < CITY.gridSize; cx++) {
    if (!isWaterCell(cx, cz)) continue;
    const buurLand =
      (cx > 0 && !isWaterCell(cx - 1, cz)) ||
      (cx < CITY.gridSize - 1 && !isWaterCell(cx + 1, cz)) ||
      (cz > 0 && !isWaterCell(cx, cz - 1)) ||
      (cz < CITY.gridSize - 1 && !isWaterCell(cx, cz + 1));
    if (!buurLand) continue;
    const wereld = cellToWorld(cx, cz);
    ctx.fillStyle = KLEUR.ondiep;
    ctx.fillRect(px(wereld.x) - cel / 2, px(wereld.z) - cel / 2, cel + 1, cel + 1);
  }
}

// ---------------------------------------------------------------------------
// 2. Groene percelen en binnentuinen, uit dezelfde chunkopbouw als de wereld.
// ---------------------------------------------------------------------------
const chunks = CITY.gridSize / CITY.chunkSize;
for (let cz = 0; cz < chunks; cz++) {
  for (let cx = 0; cx < chunks; cx++) {
    for (const groen of buildChunk(cx, cz).green) {
      ctx.fillStyle = KLEUR.groen;
      ctx.fillRect(
        px(groen.x - groen.size / 2),
        px(groen.z - groen.size / 2),
        groen.size * PER_METER,
        groen.size * PER_METER,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Het rijdek. Alleen waar `isRoadCell` een weg ziet — dus niet over de zee
//    en niet door het park, want dat was precies wat er fout op de kaart stond.
// ---------------------------------------------------------------------------
const dek = ASPHALT_HALF_WIDTH * 2 * PER_METER;
for (let cz = 0; cz < CITY.gridSize; cz++) {
  for (let cx = 0; cx < CITY.gridSize; cx++) {
    if (!isRoadCell(cx, cz) || isWaterCell(cx, cz)) continue;
    const wereld = cellToWorld(cx, cz);
    ctx.fillStyle = KLEUR.asfalt;
    // Een wegcel is acht meter breed; het rijdek ligt in het midden. Ligt de
    // cel op een noord-zuidas, dan loopt het dek verticaal, en andersom.
    if (cx % CITY.blockSize === 0) {
      ctx.fillRect(px(wereld.x) - dek / 2, px(wereld.z) - cel / 2, dek, cel + 1);
    }
    if (cz % CITY.blockSize === 0) {
      ctx.fillRect(px(wereld.x) - cel / 2, px(wereld.z) - dek / 2, cel + 1, dek);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. De panden. Eén rechthoek per vleugel, zoals de wereld ze ook zet.
// ---------------------------------------------------------------------------
function vlak(x: number, z: number, breedte: number, diepte: number): void {
  const links = px(x - breedte / 2);
  const boven = px(z - diepte / 2);
  ctx.fillRect(links, boven, breedte * PER_METER, diepte * PER_METER);
  ctx.strokeRect(links, boven, breedte * PER_METER, diepte * PER_METER);
}

function tekenPand(lot: BuildingLot): void {
  ctx.fillStyle = KLEUR.gevel;
  ctx.strokeStyle = KLEUR.gevelrand;
  ctx.lineWidth = 1;
  vlak(lot.centerX, lot.centerZ, lot.width, lot.depth);
  if (lot.wing) vlak(lot.wing.centerX, lot.wing.centerZ, lot.wing.width, lot.wing.depth);
}

const gezien = new Set<string>();
for (let cz = 0; cz < CITY.gridSize; cz++) {
  for (let cx = 0; cx < CITY.gridSize; cx++) {
    const anker = lotAnchor(cx, cz);
    if (!anker) continue;
    const sleutel = `${anker.anchorX}:${anker.anchorZ}`;
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    const lot = buildingAtCell(cx, cz);
    if (lot) tekenPand(lot);
  }
}

// ---------------------------------------------------------------------------
// 4b. De paden in het park. Zonder die slingers is het park een groen vlak, en
//     op straat lopen ze er wél.
// ---------------------------------------------------------------------------
const parkvak = parkRect();
ctx.fillStyle = KLEUR.pad;
for (const prop of parkPropsIn(parkvak.minX, parkvak.minZ, parkvak.maxX, parkvak.maxZ)) {
  if (prop.kind !== 'parkPath') continue;
  const { width, length } = PARK_PATH_SIZE;
  ctx.save();
  ctx.translate(px(prop.x), px(prop.z));
  ctx.rotate(prop.rotY);
  ctx.fillRect(
    (-width / 2) * PER_METER,
    (-length / 2) * PER_METER,
    width * PER_METER,
    length * PER_METER,
  );
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 5. Middenstreep op de doorgaande wegen, puur om je te oriënteren.
// ---------------------------------------------------------------------------
ctx.strokeStyle = KLEUR.belijning;
ctx.lineWidth = 1.5;
ctx.setLineDash([10, 14]);
for (let c = 0; c < CITY.gridSize; c++) {
  if (c % 32 !== 0) continue;
  for (const richting of ['x', 'z'] as const) {
    ctx.beginPath();
    let bezig = false;
    for (let d = 0; d < CITY.gridSize; d++) {
      const cx = richting === 'x' ? c : d;
      const cz = richting === 'x' ? d : c;
      const open = isRoadCell(cx, cz) && !isWaterCell(cx, cz);
      const wereld = cellToWorld(cx, cz);
      const punt: [number, number] = [px(wereld.x), px(wereld.z)];
      if (open && !bezig) {
        ctx.moveTo(...punt);
        bezig = true;
      } else if (open) {
        ctx.lineTo(...punt);
      } else {
        bezig = false;
      }
    }
    ctx.stroke();
  }
}
ctx.setLineDash([]);

// Geen stempel meer op deze pagina. Er stond er een in `document.title` die
// nooit gelezen werd, terwijl `scripts/render-preview.mjs` zijn eigen kopie
// schreef — twee definities van dezelfde waarheid, en die zijn ook uit elkaar
// gelopen. Het stempel komt nu uit `kaartStempel()` in gedeelde code.
