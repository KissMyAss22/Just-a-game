import { CITY, DISTRICTS, isMainRoadCell, isWaterCell } from '@game/shared';

/**
 * De stadskaart als een handvol rechthoeken.
 *
 * De stad ís data, dus de kaart hoeft geen plaatje te zijn. Districten zijn al
 * rechthoeken; het water en de doorgaande wegen worden hier uit dezelfde
 * functies afgeleid die de 3D-wereld gebruikt. Zo kán de kaart niet afwijken
 * van waar je loopt.
 *
 * Waarom geen SVG of canvas: daar zou een extra afhankelijkheid voor nodig
 * zijn, en dat is veel voor één scherm. Rechthoeken zijn gewone Views, en het
 * hele stel wordt één keer uitgerekend en daarna nooit meer.
 */

export interface MapRect {
  /** Alles in celcoördinaten, 0..gridSize. De opmaak schaalt het zelf. */
  cx: number;
  cz: number;
  w: number;
  h: number;
  color: string;
}

/**
 * Op halve resolutie kijken: 64x64 in plaats van 128x128.
 *
 * Op een kaart van een paar honderd pixels is één cel minder dan drie pixels,
 * dus het scheelt niets in wat je ziet — en het scheelt wel vier keer zoveel
 * werk en vlakken.
 */
const STEP = 2;

/** De wijken, in de kleur die ze in het spel ook hebben. */
export function districtRects(): MapRect[] {
  return DISTRICTS.map((district) => {
    const [x0, z0, x1, z1] = district.bounds;
    return { cx: x0, cz: z0, w: x1 - x0, h: z1 - z0, color: district.groundColor };
  });
}

/**
 * Het water, als aaneengesloten stukken per rij.
 *
 * Cel voor cel zou duizenden vlakken opleveren. Door een rij af te lopen en
 * opeenvolgend water samen te voegen tot één rechthoek blijven er een paar
 * honderd over, en dat tekent een telefoon zonder morren.
 */
export function waterRects(color = '#1d3a4d'): MapRect[] {
  const out: MapRect[] = [];
  for (let cz = 0; cz < CITY.gridSize; cz += STEP) {
    let runStart = -1;
    for (let cx = 0; cx <= CITY.gridSize; cx += STEP) {
      const wet = cx < CITY.gridSize && isWaterCell(cx, cz);
      if (wet && runStart < 0) runStart = cx;
      if (!wet && runStart >= 0) {
        out.push({ cx: runStart, cz, w: cx - runStart, h: STEP, color });
        runStart = -1;
      }
    }
  }
  return out;
}

/**
 * De doorgaande wegen. Die liggen op elke 32e cel, dus het zijn er vier per
 * richting — genoeg om je te oriënteren zonder dat de kaart een raster wordt.
 */
export function mainRoadRects(color = 'rgba(230, 236, 245, 0.22)'): MapRect[] {
  const out: MapRect[] = [];
  for (let c = 0; c < CITY.gridSize; c++) {
    if (!isMainRoadCell(c, 1)) continue;
    out.push({ cx: c, cz: 0, w: 1, h: CITY.gridSize, color });
  }
  for (let c = 0; c < CITY.gridSize; c++) {
    if (!isMainRoadCell(1, c)) continue;
    out.push({ cx: 0, cz: c, w: CITY.gridSize, h: 1, color });
  }
  return out;
}
