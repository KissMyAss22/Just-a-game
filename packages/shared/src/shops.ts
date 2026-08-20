import type { DistrictId } from './city/districts';
import { frontageSpots } from './city/frontage';

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
 * Zoekt de plek van een winkel: een stukje stoep voor een pand, in de bedoelde
 * wijk, zo dicht mogelijk bij de voorkeurscel.
 *
 * Het zoekwerk zelf staat in `city/frontage.ts`, want de voordeuren van
 * woningen hebben precies hetzelfde nodig. Hier blijft alleen over wélke plek
 * we willen.
 */
export function shopSpot(shop: PawnShopDef): ShopSpot | null {
  const spots = frontageSpots({ preferred: shop.preferred, district: shop.district });
  const best = spots[0];
  if (!best) return null;
  return {
    id: shop.id,
    name: shop.name,
    district: shop.district,
    x: best.x,
    z: best.z,
    rotY: best.rotY,
  };
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
