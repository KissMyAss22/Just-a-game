import type { DistrictId } from './city/districts';
import { frontageSpots } from './city/frontage';
import { specialArea, specialAreaCenter } from './city/layout';

/**
 * De pandjeshuizen: de enige plek waar je spullen kunt verkopen.
 *
 * Dat verkopen ergens moet gebeuren is een ontwerpkeuze, geen beperking. Een
 * knop in je rugzak maakt de stad een decor waar je doorheen loopt; een
 * bestemming maakt hem een plek waar je naartoe gaat.
 *
 * Er zijn er twee, en dat is minder dan de drie waarmee dit begon. Die drie
 * werden alle drie door een ringzoeker tegen de eerste de beste gevel gezet: de
 * plek stond vast, maar zag er niet uit alsof iemand hem gekozen had, en dat
 * voelde alsof winkels net als items ergens neergevallen waren. Nu staat er één
 * als kraam op het Marktplein — een plek die je herkent — en één tegen een gevel
 * op het Industrieterrein voor de westkant van de stad.
 *
 * De prijs daarvan is eerlijk: de verste hoek van de stad ligt nu op 773 meter
 * in plaats van een paar honderd. Dat is ruim twee minuten lopen en veel minder
 * met een voertuig, en een test bewaakt die grens zodat het een keuze blijft en
 * geen sluipende verslechtering.
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
  // Westkant: dekt het Industrieterrein, de Strip en het Vliegveld.
  { id: 'industrial', name: 'Pandjeshuis Industrie', district: 'industrial', preferred: { cx: 21, cz: 64 } },
] as const;

/**
 * De kramen op het Marktplein.
 *
 * Waarom dit anders werkt dan een winkelpui: een pui hangt aan een gevel, en op
 * een plein staan geen gevels. Belangrijker nog — een winkel die door een
 * ringzoeker tegen het eerste het beste woonblok wordt gezet, stáát er niet, hij
 * belandt er. Vier vaste kramen op een rij zijn wél gekozen, en er is meteen
 * plek voor wat er later bij komt.
 *
 * De plekken worden afgeleid uit het middelpunt van het plein, dus ze schuiven
 * mee als het plein ooit verhuist.
 */
export interface MarketStall {
  /** 0..3, van west naar oost. */
  slot: number;
  x: number;
  z: number;
  /** De kraam kijkt naar het midden van het plein. */
  rotY: number;
  /** De winkel die hier staat, of null zolang de plek vrij is. */
  shopId: string | null;
  name: string | null;
}

/** Hoeveel kramen er op het plein passen. */
export const MARKET_STALLS = 4;
/** Onderlinge afstand in meters. Ruim genoeg om ertussen te lopen. */
const STALL_SPACING = 9;

/** Welke kraam welke winkel is. Nu één; de rest wacht op nieuwe winkelsoorten. */
const STALL_SHOPS: Record<number, { id: string; name: string }> = {
  0: { id: 'plein', name: 'Pandjeshuis Centrum' },
};

export function marketStalls(): MarketStall[] {
  const plein = specialArea('plein');
  const midden = specialAreaCenter(plein);
  const out: MarketStall[] = [];
  for (let slot = 0; slot < MARKET_STALLS; slot++) {
    // Op een rij ten zuiden van het midden, kijkend naar het plein toe.
    const offset = (slot - (MARKET_STALLS - 1) / 2) * STALL_SPACING;
    const winkel = STALL_SHOPS[slot] ?? null;
    out.push({
      slot,
      x: midden.x + offset,
      z: midden.z + 12,
      rotY: Math.PI,
      shopId: winkel?.id ?? null,
      name: winkel?.name ?? null,
    });
  }
  return out;
}

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
    const gevels = PAWN_SHOPS.map(shopSpot).filter((spot): spot is ShopSpot => spot !== null);
    // De kramen op het plein tellen gewoon mee als winkel: voor de HUD, de
    // kaart en de afstandscontrole op de server is er geen verschil tussen een
    // pui en een kraam.
    const kramen = marketStalls()
      .filter((kraam) => kraam.shopId !== null)
      .map((kraam) => ({
        id: kraam.shopId!,
        name: kraam.name!,
        district: 'downtown' as const,
        x: kraam.x,
        z: kraam.z,
        rotY: kraam.rotY,
      }));
    cached = [...kramen, ...gevels];
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
