import type { DistrictId } from './city/districts';
import { cellToWorld, districtAt, isInsideCity, isWalkable } from './city/layout';
import { LAMP_OFFSET, distanceToRoadAxis, nearestRoadAxis } from './city/streets';

/**
 * De pandjeshuizen: de enige plek waar je spullen kunt verkopen.
 *
 * Dat verkopen ergens moet gebeuren is een ontwerpkeuze, geen beperking. Een
 * knop in je rugzak maakt de stad een decor waar je doorheen loopt; een
 * bestemming maakt hem een plek waar je naartoe gaat. Drie stuks, verspreid
 * over de kaart, zodat je nooit een halve stad hoeft te lopen — met één winkel
 * zou een volle rugzak op het Vliegveld een straf zijn.
 *
 * Ze staan hier en niet in de database om dezelfde reden als de rest van de
 * stad: client en server moeten het eens zijn over waar ze staan, anders wijst
 * de app je ergens heen waar de server je niet verwacht.
 */

export interface PawnShopDef {
  id: string;
  name: string;
  district: DistrictId;
  /**
   * Waar we ongeveer willen dat hij staat. De echte plek wordt gezocht: welk
   * pand daar staat hangt van de stadsgenerator af, en die kan veranderen.
   */
  preferred: { cx: number; cz: number };
}

export const PAWN_SHOPS: readonly PawnShopDef[] = [
  // Vlak bij waar je begint (cel 64,64), zodat je er vanaf het eerste uur een hebt.
  { id: 'oldtown', name: 'Pandjeshuis Oude Stad', district: 'oldTown', preferred: { cx: 61, cz: 61 } },
  // Westkant: dekt het Industrieterrein, de Strip en het Vliegveld.
  { id: 'industrial', name: 'Pandjeshuis Industrie', district: 'industrial', preferred: { cx: 21, cz: 64 } },
  // Oostkant: dekt de Buitenwijk, de Heuvels en de Jachthaven.
  { id: 'suburbs', name: 'Pandjeshuis Buitenwijk', district: 'suburbs', preferred: { cx: 106, cz: 66 } },
] as const;

/** Binnen deze afstand kun je handelen, in meters. */
export const SHOP_REACH = 6;

/**
 * Extra marge op die afstand voor de servercontrole.
 *
 * De server toetst tegen de positie die hij zelf heeft opgeslagen, en die
 * loopt altijd een fractie achter op waar je op je scherm staat. Zonder marge
 * krijg je een weigering terwijl je de verkoper aankijkt.
 */
export const SHOP_REACH_TOLERANCE = 4;

export interface ShopSpot {
  id: string;
  name: string;
  district: DistrictId;
  x: number;
  z: number;
  /** Rotatie om de y-as: de verkoper kijkt de straat op. */
  rotY: number;
}

/**
 * Zoekt de plek van een winkel: in ringen naar buiten vanaf de voorkeurscel,
 * tot er een stukje stoep is waar een verkoper past.
 *
 * Bewust zoeken en niet uitrekenen. De eerste versie berekende de stoepplek
 * uit het perceel en zijn gevelkant, en dat viel om op hoekpanden: die zijn
 * L-vormig, en de vleugel zet precies die stoep dicht. Uitproberen of een punt
 * begaanbaar is, is hier korter én betrouwbaarder dan alle vormen naspelen —
 * en het blijft kloppen als de stadsgenerator weer verandert.
 */
export function shopSpot(shop: PawnShopDef): ShopSpot | null {
  for (let ring = 0; ring <= 14; ring++) {
    const found: { spot: ShopSpot; wall: boolean; offCentre: number }[] = [];

    for (const [dx, dz] of ringCells(ring)) {
      const cx = shop.preferred.cx + dx;
      const cz = shop.preferred.cz + dz;
      if (!isInsideCity(cx, cz)) continue;
      // Binnen de bedoelde wijk blijven, anders schuift een winkel bij een
      // volgende wijziging zomaar naar de buurwijk.
      if (districtAt(cx, cz).id !== shop.district) continue;

      const center = cellToWorld(cx, cz);
      for (const [ox, oz] of SAMPLES) {
        const x = center.x + ox;
        const z = center.z + oz;
        // In de stoepband blijven: vanaf de stoeprand tot aan de gevel. De
        // ondergrens is geen luxe — precies op 3,0 staat hij half op de
        // stoeprand.
        const fromAxis = Math.min(distanceToRoadAxis(x), distanceToRoadAxis(z));
        if (fromAxis < PAVEMENT_NEAR || fromAxis > PAVEMENT_FAR) continue;
        // Dezelfde straal als de speler zelf. Past hij er, dan past de
        // verkoper er ook.
        if (!isWalkable(x, z, 0.45)) continue;

        found.push({
          spot: { id: shop.id, name: shop.name, district: shop.district, x, z, rotY: facingRoad(x, z) },
          wall: hasWallBehind(x, z),
          offCentre: Math.abs(fromAxis - LAMP_OFFSET),
        });
      }
    }

    if (found.length === 0) continue;
    // Liefst met een pand in de rug — dan leest het als een winkelpui in
    // plaats van een kraam midden op de stoep — en zo dicht mogelijk bij het
    // midden van de stoep.
    found.sort((a, b) => Number(b.wall) - Number(a.wall) || a.offCentre - b.offCentre);
    return found[0]!.spot;
  }
  return null;
}

/** De stoepband waarin de verkoper mag staan, in meters uit het hart van de weg. */
const PAVEMENT_NEAR = 3.4;
const PAVEMENT_FAR = 4.5;

/**
 * Waar we binnen een cel kijken: een raster van negen punten.
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

/** De draaiing waarmee de verkoper de straat op kijkt. */
function facingRoad(x: number, z: number): number {
  const alongZ = distanceToRoadAxis(x) <= distanceToRoadAxis(z);
  if (alongZ) {
    // Noord-zuidstraat: sta je ten oosten van de as, dan kijk je naar het westen.
    return x > nearestRoadAxis(x) ? -Math.PI / 2 : Math.PI / 2;
  }
  return z > nearestRoadAxis(z) ? Math.PI : 0;
}

/** Staat er binnen twee meter achter dit punt een gevel om een bord aan te hangen? */
function hasWallBehind(x: number, z: number): boolean {
  const behind = facingRoad(x, z) + Math.PI;
  const bx = x + Math.sin(behind) * 1.6;
  const bz = z + Math.cos(behind) * 1.6;
  return !isWalkable(bx, bz, 0.3);
}

/** De cellen op precies deze ring rond de oorsprong, in een vaste volgorde. */
function ringCells(ring: number): [number, number][] {
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

let cached: ShopSpot[] | null = null;

/** Alle winkels met hun echte plek. Wordt één keer uitgerekend. */
export function shopSpots(): ShopSpot[] {
  if (!cached) {
    cached = PAWN_SHOPS.map(shopSpot).filter((spot): spot is ShopSpot => spot !== null);
  }
  return cached;
}

export interface NearestShop {
  spot: ShopSpot;
  distance: number;
}

/** De dichtstbijzijnde winkel vanaf een punt, of null als er geen enkele is. */
export function nearestShop(x: number, z: number): NearestShop | null {
  let best: NearestShop | null = null;
  for (const spot of shopSpots()) {
    const distance = Math.hypot(spot.x - x, spot.z - z);
    if (!best || distance < best.distance) best = { spot, distance };
  }
  return best;
}

/** Sta je dicht genoeg bij een winkel om te kunnen handelen? */
export function atShop(x: number, z: number, tolerance = 0): boolean {
  const near = nearestShop(x, z);
  return near !== null && near.distance <= SHOP_REACH + tolerance;
}
