import type { DistrictId } from './districts';
import {
  buildingAtCell,
  cellToWorld,
  districtAt,
  isInsideCity,
  isWalkable,
  worldToCell,
  type BuildingLot,
} from './layout';
import { LAMP_OFFSET, distanceToRoadAxis, nearestRoadAxis } from './streets';

/**
 * Een plek op de stoep vóór een pand vinden.
 *
 * Dit staat apart omdat het op twee plekken nodig is — de pandjeshuizen en de
 * voordeuren van woningen — en omdat het lastiger is dan het lijkt.
 *
 * De eerste versie berekende zo'n plek uit het perceel en zijn gevelkant. Dat
 * viel om op precies de panden die je wilt hebben: hoekpanden zijn L-vormig, en
 * die vleugel zet net die stoep dicht. Van de drie winkels die er toen waren
 * kwamen er twee zo nergens terecht. Uitproberen of een punt begaanbaar is, is korter én
 * betrouwbaarder dan alle vormen naspelen, en het blijft kloppen als de
 * stadsgenerator weer verandert.
 */

/**
 * De stoepband waarin iets mag staan, in meters uit het hart van de weg.
 *
 * Het asfalt loopt tot 3,0 m en de gevel staat op 4,6 m, dus de stoep is maar
 * anderhalve meter breed. De ondergrens van 3,4 is geen luxe: precies op 3,0
 * sta je half op de stoeprand.
 */
export const PAVEMENT_NEAR = 3.4;
export const PAVEMENT_FAR = 4.5;

/**
 * Waar we binnen een cel kijken.
 *
 * Een cel is acht meter en de stoep anderhalve meter breed, dus met alleen het
 * midden van de cel mis je hem gegarandeerd.
 */
const SAMPLES: readonly [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let ox = -3.6; ox <= 3.6; ox += 0.4) {
    for (let oz = -3.6; oz <= 3.6; oz += 0.4) out.push([ox, oz]);
  }
  return out;
})();

/** De draaiing waarmee je vanaf de stoep de straat op kijkt. */
export function facingRoad(x: number, z: number): number {
  const alongZ = distanceToRoadAxis(x) <= distanceToRoadAxis(z);
  if (alongZ) {
    // Noord-zuidstraat: sta je ten oosten van de as, dan kijk je naar het westen.
    return x > nearestRoadAxis(x) ? -Math.PI / 2 : Math.PI / 2;
  }
  return z > nearestRoadAxis(z) ? Math.PI : 0;
}

/** Staat er binnen twee meter achter dit punt een gevel om iets aan te hangen? */
export function hasWallBehind(x: number, z: number): boolean {
  const behind = facingRoad(x, z) + Math.PI;
  const bx = x + Math.sin(behind) * 1.6;
  const bz = z + Math.cos(behind) * 1.6;
  return !isWalkable(bx, bz, 0.3);
}

/** Het pand waar je voor staat als je vanaf de stoep naar achteren kijkt. */
export function buildingBehind(x: number, z: number): BuildingLot | null {
  const behind = facingRoad(x, z) + Math.PI;
  const bx = x + Math.sin(behind) * 2.4;
  const bz = z + Math.cos(behind) * 2.4;
  // Via worldToCell en niet met de celmaat in de hand: dat is precies het
  // soort ingetypte aanname dat eerder al een keer de halve stad verschoof.
  const { cx, cz } = worldToCell(bx, bz);
  return buildingAtCell(cx, cz);
}

/** De cellen op precies deze ring rond de oorsprong, in een vaste volgorde. */
export function ringCells(ring: number): [number, number][] {
  if (ring === 0) return [[0, 0]];
  const out: [number, number][] = [];
  for (let d = -ring; d <= ring; d++) {
    out.push([d, -ring], [d, ring]);
  }
  for (let d = -ring + 1; d <= ring - 1; d++) {
    out.push([-ring, d], [ring, d]);
  }
  return out;
}

export interface FrontageSpot {
  x: number;
  z: number;
  /** Kijkrichting: de straat op. */
  rotY: number;
  /** Het pand waar deze plek bij hoort, als dat te bepalen is. */
  lot: BuildingLot | null;
}

export interface FrontageSearch {
  /** Waar we ongeveer willen uitkomen. */
  preferred: { cx: number; cz: number };
  /** Binnen deze wijk blijven. */
  district: DistrictId;
  /** Hoeveel ringen naar buiten we hoogstens kijken. */
  maxRings?: number;
  /** Een extra eis aan het pand achter de plek, bijvoorbeeld op bouwstijl. */
  accept?: (lot: BuildingLot) => boolean;
  /**
   * Doorzoeken tot er zoveel *verschillende panden* gevonden zijn.
   *
   * Zonder dit stopt de zoeker bij de eerste ring die iets oplevert, en dat is
   * één stukje stoep voor één pand. Voor een winkel is dat prima — die wil
   * juist zo dicht mogelijk bij de voorkeurscel staan. Voor de huisadressen
   * niet: daar moet er iets te kiezen zijn, anders krijgt elke speler dezelfde
   * villa met een meter verschil op de stoep.
   */
  minLots?: number;
}

/**
 * Alle bruikbare stoepplekken in de eerste ring die er een oplevert, op
 * volgorde van bruikbaarheid: eerst met een gevel in de rug, dan zo dicht
 * mogelijk bij het midden van de stoep.
 *
 * Meerdere teruggeven en niet één, zodat de aanroeper er zelf uit kan kiezen —
 * daar hangen de adressen van de spelers aan.
 */
export function frontageSpots(search: FrontageSearch): FrontageSpot[] {
  const maxRings = search.maxRings ?? 14;
  const minLots = search.minLots ?? 1;
  const found: { spot: FrontageSpot; wall: boolean; offCentre: number }[] = [];

  for (let ring = 0; ring <= maxRings; ring++) {
    for (const [dx, dz] of ringCells(ring)) {
      const cx = search.preferred.cx + dx;
      const cz = search.preferred.cz + dz;
      if (!isInsideCity(cx, cz)) continue;
      // Binnen de bedoelde wijk blijven, anders schuift een adres bij een
      // volgende wijziging zomaar naar de buurwijk.
      if (districtAt(cx, cz).id !== search.district) continue;

      const center = cellToWorld(cx, cz);
      for (const [ox, oz] of SAMPLES) {
        const x = center.x + ox;
        const z = center.z + oz;
        const fromAxis = Math.min(distanceToRoadAxis(x), distanceToRoadAxis(z));
        if (fromAxis < PAVEMENT_NEAR || fromAxis > PAVEMENT_FAR) continue;
        // Dezelfde straal als de speler zelf: past hij er, dan past het.
        if (!isWalkable(x, z, 0.45)) continue;

        const lot = buildingBehind(x, z);
        if (search.accept && (!lot || !search.accept(lot))) continue;

        found.push({
          spot: { x, z, rotY: facingRoad(x, z), lot },
          wall: hasWallBehind(x, z),
          offCentre: Math.abs(fromAxis - LAMP_OFFSET),
        });
      }
    }

    // Genoeg verschillende panden? Dan hoeven we niet verder naar buiten.
    const lots = new Set(
      found.map((entry) =>
        entry.spot.lot ? `${entry.spot.lot.anchorX}:${entry.spot.lot.anchorZ}` : 'geen',
      ),
    );
    if (found.length > 0 && lots.size >= minLots) break;
  }

  found.sort((a, b) => Number(b.wall) - Number(a.wall) || a.offCentre - b.offCentre);
  return found.map((entry) => entry.spot);
}

/**
 * Eén plek per pand, op volgorde van bruikbaarheid.
 *
 * De zoeker levert tientallen punten op dezelfde stoep; voor een adres wil je
 * juist verschillende pánden, anders wonen alle spelers naast elkaar op een
 * meter afstand.
 */
export function frontageByLot(search: FrontageSearch): FrontageSpot[] {
  const seen = new Set<string>();
  const out: FrontageSpot[] = [];
  for (const spot of frontageSpots(search)) {
    const key = spot.lot ? `${spot.lot.anchorX}:${spot.lot.anchorZ}` : `${spot.x}:${spot.z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(spot);
  }
  return out;
}
