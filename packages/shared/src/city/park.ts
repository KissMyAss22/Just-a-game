import { valueAt } from '../rng';
import {
  CITY,
  PARK_BOUNDS,
  PARK_CAUSEWAY,
  cellToWorld,
  isParkSide,
  isWalkable,
  isWaterCell,
  worldToCell,
} from './layout';
import type { StreetProp } from './streets';

/**
 * Wat er in Het Verlaten Park staat.
 *
 * Bewust náást `streetPropsIn` en niet erin. Het straatmeubilair komt uit de
 * wegassen — lantaarns om de vierentwintig meter, auto's aan één kant van de
 * rijbaan — en het park heeft geen wegen. Die twee generatoren door elkaar
 * heen laten lopen is precies hoe er zevenhonderd lantaarnpalen in het gras
 * belandden: de ene functie ging over de stad en werd toch overal aangeroepen.
 *
 * Dezelfde regels als de rest van `city/`: alles komt uit `valueAt`, dus
 * client en server zien exact hetzelfde park zonder er iets over af te spreken.
 */

/**
 * Eigen zaadje voor het park.
 *
 * Niet `CITY.seed`, want dan liggen de paden op dezelfde ruis als de gebouwen
 * en zouden ze mee gaan schuiven bij elke wijziging aan de stad.
 */
export const PARK_SEED = 20260821;

/**
 * Afstand tussen twee paden.
 *
 * Nadrukkelijk géén 40 meter, want dat is `ROAD_PERIOD`. Op veertig meter
 * zouden de paden precies op de oude straatassen vallen en had je het
 * stratenraster terug dat we net weggehaald hebben — alleen dan in grind.
 */
export const PARK_PATH_PERIOD = 34;
const PATH_PERIOD = PARK_PATH_PERIOD;
/** Lengte van één plaat pad. */
const PATH_STEP = 8;
/** Platen overlappen elkaar, anders staat er een kier in elke bocht. */
const PATH_OVERLAP = 1.8;
/** Hoe ver een pad uit zijn as slingert. */
const PATH_WANDER = 3.4;
/** Over hoeveel meter één slinger loopt. */
const PATH_WAVELENGTH = 46;
/** Halve breedte van het pad; de bank staat net buiten de rand. */
const PATH_HALF_WIDTH = 1.1;

/** Om de hoeveel meter is er kans op een bank langs het pad. */
const BENCH_SPACING = 28;
/** En op een omgevallen lantaarnpaal. */
const LAMP_SPACING = 38;

/**
 * Hoe ver het pad hier uit zijn as ligt.
 *
 * Een sinus in plaats van ruis: ruis geeft per plaat een andere uitwijking en
 * dus een zigzag, en een pad dat om de acht meter een knik maakt leest als een
 * fout. De faseverschuiving per pad komt wél uit `valueAt`, zodat niet elk pad
 * dezelfde bocht maakt.
 */
function pathOffset(line: number, along: number, seed: number): number {
  const phase = valueAt(seed + 41, line, 0) * PATH_WAVELENGTH;
  return Math.sin(((along + phase) / PATH_WAVELENGTH) * Math.PI * 2) * PATH_WANDER;
}

function pushPathLine(
  out: StreetProp[],
  axis: 'x' | 'z',
  line: number,
  from: number,
  to: number,
  seed: number,
): void {
  const axisValue = line * PATH_PERIOD;
  const first = Math.floor(from / PATH_STEP) * PATH_STEP;
  for (let along = first; along < to; along += PATH_STEP) {
    const startOffset = pathOffset(line, along, seed);
    const endOffset = pathOffset(line, along + PATH_STEP, seed);
    const middle = along + PATH_STEP / 2;
    const offset = (startOffset + endOffset) / 2;
    // De plaat draait mee met de bocht, zodat de slinger een pad blijft en
    // geen trap wordt.
    const tilt = Math.atan2(endOffset - startOffset, PATH_STEP);

    const x = axis === 'z' ? axisValue + offset : middle;
    const z = axis === 'z' ? middle : axisValue + offset;
    const cell = worldToCell(x, z);
    if (!isParkSide(cell.cx, cell.cz)) continue;
    // Een pad loopt niet dwars door een ruïne heen. Dat het daardoor hier en
    // daar ophoudt is geen gebrek: het is een verlaten park.
    if (!isWalkable(x, z, PATH_HALF_WIDTH)) continue;

    out.push({
      kind: 'parkPath',
      x,
      z,
      rotY: axis === 'z' ? tilt : Math.PI / 2 - tilt,
      scale: 1,
      variant: valueAt(seed + 42, x | 0, z | 0),
    });
  }
}

function pushAlongPath(
  out: StreetProp[],
  axis: 'x' | 'z',
  line: number,
  from: number,
  to: number,
  seed: number,
): void {
  const axisValue = line * PATH_PERIOD;

  const place = (
    kind: 'parkBench' | 'brokenLamp',
    spacing: number,
    aside: number,
    keep: (roll: number) => boolean,
    salt: number,
  ): void => {
    const first = Math.ceil(from / spacing) * spacing;
    for (let along = first; along < to; along += spacing) {
      const offset = pathOffset(line, along, seed);
      const side = valueAt(seed + salt + 1, Math.round(along), line) < 0.5 ? -1 : 1;
      const x = axis === 'z' ? axisValue + offset + side * aside : along;
      const z = axis === 'z' ? along : axisValue + offset + side * aside;
      if (!keep(valueAt(seed + salt, x | 0, z | 0))) continue;
      const cell = worldToCell(x, z);
      if (!isParkSide(cell.cx, cell.cz)) continue;
      if (isWaterCell(cell.cx, cell.cz)) continue;
      if (!isWalkable(x, z, 0.5)) continue;

      // De bank kijkt naar het pad toe; de paal ligt er zoals hij gevallen is.
      const facing = axis === 'z' ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : side > 0 ? Math.PI : 0;
      const roll = valueAt(seed + salt + 2, x | 0, z | 0);
      out.push({
        kind,
        x,
        z,
        rotY: kind === 'parkBench' ? facing : roll * Math.PI * 2,
        scale: 1,
        variant: roll,
      });
    }
  };

  place('parkBench', BENCH_SPACING, PATH_HALF_WIDTH + 1.3, (roll) => roll > 0.52, 50);
  place('brokenLamp', LAMP_SPACING, PATH_HALF_WIDTH + 0.9, (roll) => roll < 0.34, 60);
}

/**
 * Alle paden, banken en omgevallen palen binnen een rechthoek.
 *
 * Zelfde vorm en zelfde belofte als `streetPropsIn`: dezelfde rechthoek geeft
 * altijd hetzelfde park.
 */
export function parkPropsIn(
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  seed = PARK_SEED,
): StreetProp[] {
  const out: StreetProp[] = [];

  const firstLineZ = Math.floor(minX / PATH_PERIOD);
  const lastLineZ = Math.ceil(maxX / PATH_PERIOD);
  for (let line = firstLineZ; line <= lastLineZ; line++) {
    pushPathLine(out, 'z', line, minZ, maxZ, seed);
    pushAlongPath(out, 'z', line, minZ, maxZ, seed);
  }

  const firstLineX = Math.floor(minZ / PATH_PERIOD);
  const lastLineX = Math.ceil(maxZ / PATH_PERIOD);
  for (let line = firstLineX; line <= lastLineX; line++) {
    pushPathLine(out, 'x', line, minX, maxX, seed);
    pushAlongPath(out, 'x', line, minX, maxX, seed);
  }

  return out;
}

/** De maten die de renderer nodig heeft om een plaat pad te tekenen. */
export const PARK_PATH_SIZE = { width: PATH_HALF_WIDTH * 2, length: PATH_STEP + PATH_OVERLAP };

/**
 * Het hele park als rechthoek in meters — handig voor tests en de renderproef.
 *
 * Via `cellToWorld` en niet met de oorsprong en de celmaat ingetypt: dat is
 * dezelfde omrekening die overal elders in `city/` staat, en juist die twee
 * getallen zijn deze ronde al een keer verschoven.
 */
export function parkRect(): WorldRect {
  return cellRect(PARK_BOUNDS);
}

/** Een rechthoek in wereldmeters. */
export interface WorldRect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

function cellRect(bounds: { x0: number; z0: number; x1: number; z1: number }): WorldRect {
  const west = cellToWorld(bounds.x0, bounds.z0);
  const oost = cellToWorld(bounds.x1, bounds.z1);
  const half = CITY.cellSize / 2;
  return { minX: west.x - half, minZ: west.z - half, maxX: oost.x - half, maxZ: oost.z - half };
}

/**
 * De stukken land aan de parkzijde binnen een gebied.
 *
 * Waarvoor: de stad ligt op een plateau ter hoogte van de stoeprand en alleen
 * het rijdek ligt in een geul daaronder. Het park is land, dus dat hoort op
 * diezelfde hoogte te liggen — anders zweeft alles wat erop staat, want dat
 * rekent met `groundHeightAt`. Het grondvlak van een chunk simpelweg omhoog
 * schuiven kan níét: dat vlak loopt door over de zeecellen, en dan verdwijnt
 * de zee eronder. Vandaar dat het land een eigen vorm krijgt in plaats van een
 * hoogte, en dat die vorm hier staat en niet in de renderer: het is de vorm
 * van de wereld, en de server rekent met dezelfde grenzen.
 *
 * Het park en de landtong sluiten op elkaar aan (`PARK_CAUSEWAY.x1` is
 * `PARK_BOUNDS.x0`), dus de twee rechthoeken overlappen elkaar nooit.
 */
export function parkLandIn(minX: number, minZ: number, maxX: number, maxZ: number): WorldRect[] {
  const out: WorldRect[] = [];
  for (const rect of [cellRect(PARK_BOUNDS), cellRect(PARK_CAUSEWAY)]) {
    const clipped = {
      minX: Math.max(rect.minX, minX),
      minZ: Math.max(rect.minZ, minZ),
      maxX: Math.min(rect.maxX, maxX),
      maxZ: Math.min(rect.maxZ, maxZ),
    };
    if (clipped.maxX > clipped.minX && clipped.maxZ > clipped.minZ) out.push(clipped);
  }
  return out;
}
