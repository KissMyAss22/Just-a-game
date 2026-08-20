import type { DistrictId } from './city/districts';
import { frontageByLot } from './city/frontage';
import type { BuildingLot, BuildingStyle } from './city/layout';
import { PROPERTIES, getProperty } from './properties';

/**
 * Waar je woont: elk soort woning is een echt pand in de stad.
 *
 * Je woning was een keuze in een menu. Nu heeft hij een adres waar je naartoe
 * loopt en waar je naar binnen gaat — dat is wat een villa kopen van een getal
 * in een lijst tot een plek maakt.
 *
 * Het zoekwerk komt uit `city/frontage.ts`, dezelfde functie die de
 * pandjeshuizen hun stoepplek geeft. Wat hier bij komt is de vraag *welk soort*
 * pand erbij hoort: een appartement in een flat, een villa vrijstaand in de
 * Heuvels.
 */

export interface AddressSpec {
  /** In welke wijk je woont. */
  district: DistrictId;
  /** Waar in die wijk we ongeveer beginnen te zoeken. */
  preferred: { cx: number; cz: number };
  /**
   * Wat voor pand het moet zijn. `block` is een flatgebouw, `house` een
   * grondgebonden woning, `tower` een woontoren. Die stijlen bestaan al in de
   * stadsgenerator; we kiezen er alleen uit.
   */
  style: BuildingStyle;
  /** Minimaal aantal verdiepingen, om een flat van een winkelpand te scheiden. */
  minFloors?: number;
  /**
   * Deelt iedereen met deze woning hetzelfde pand?
   *
   * Een flat is per definitie gedeeld: één gebouw, veel appartementen, en jouw
   * huisnummer op de deur. Een huis of villa is van jou alleen, en dan kiest je
   * seed er eentje uit de kandidaten.
   */
  shared: boolean;
  /** Korte omschrijving voor in het scherm. */
  street: string;
}

export const ADDRESSES: Readonly<Record<string, AddressSpec>> = {
  squat: {
    district: 'oldTown',
    preferred: { cx: 68, cz: 68 },
    style: 'house',
    shared: false,
    street: 'Achterstraat, Oude Stad',
  },
  studio: {
    district: 'oldTown',
    preferred: { cx: 56, cz: 52 },
    style: 'block',
    minFloors: 3,
    shared: true,
    street: 'Havenflat, Oude Stad',
  },
  apartment: {
    district: 'downtown',
    preferred: { cx: 58, cz: 30 },
    style: 'block',
    minFloors: 5,
    shared: true,
    street: 'Parkflat, Centrum',
  },
  townhouse: {
    district: 'suburbs',
    preferred: { cx: 100, cz: 60 },
    style: 'house',
    shared: false,
    street: 'Lindelaan, Buitenwijk',
  },
  loft: {
    district: 'industrial',
    preferred: { cx: 22, cz: 78 },
    style: 'block',
    shared: false,
    street: 'Pakhuiskade, Industrieterrein',
  },
  villa: {
    district: 'hills',
    preferred: { cx: 104, cz: 20 },
    style: 'house',
    shared: false,
    street: 'Hoogzicht, De Heuvels',
  },
  penthouse: {
    district: 'downtown',
    preferred: { cx: 64, cz: 16 },
    style: 'tower',
    shared: false,
    street: 'Toren aan het Plein, Centrum',
  },
  mansion: {
    district: 'hills',
    preferred: { cx: 116, cz: 12 },
    style: 'house',
    shared: false,
    street: 'Parklaan, De Heuvels',
  },
  island_estate: {
    district: 'island',
    preferred: { cx: 20, cz: 111 },
    style: 'house',
    shared: false,
    street: 'Privé-eiland',
  },
} as const;

/** Binnen deze afstand sta je voor je deur, in meters. */
export const DOOR_REACH = 6;

/**
 * Extra marge voor de servercontrole: de opgeslagen positie loopt altijd een
 * fractie achter op waar je op je scherm staat. Zelfde reden als bij de winkels.
 */
export const DOOR_REACH_TOLERANCE = 4;

export interface HomeAddress {
  propertyId: string;
  /** Waar de deur is: de stoep ervoor. */
  x: number;
  z: number;
  /** Kijkrichting vanaf de deur, de straat op. */
  rotY: number;
  district: DistrictId;
  street: string;
  /** Bij een flat: welk appartement van jou is. Leeg bij een eigen huis. */
  unit: string;
  lot: BuildingLot | null;
}

/**
 * Hoeveel kandidaten we bekijken voor een eigen huis.
 *
 * Meer kandidaten is meer spreiding, maar ook een grotere kans dat je huis aan
 * de andere kant van de wijk staat dan waar je het zoekt. Twaalf is genoeg om
 * niet iedereen op dezelfde stoep te zetten.
 */
const CANDIDATES = 12;

/** Een stabiel getal uit een seed; dezelfde speler krijgt altijd hetzelfde huis. */
function pick(seed: number, count: number): number {
  let hash = (seed ^ 0x9e3779b9) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) % Math.max(1, count);
}

const cache = new Map<string, { x: number; z: number; rotY: number; lot: BuildingLot | null } | null>();

/**
 * Het adres van een woning voor een bepaalde speler.
 *
 * Bij een gedeelde flat maakt de seed alleen je huisnummer uit; bij een eigen
 * huis kiest hij welk pand van jou is.
 */
export function homeAddress(propertyId: string, seed: number): HomeAddress | null {
  const spec = ADDRESSES[propertyId];
  if (!spec) return null;

  // Alleen de plék wordt bewaard, niet het hele adres: bij een gedeelde flat
  // hangt het huisnummer wél aan je seed, en dat zou anders voor iedereen
  // hetzelfde worden.
  const key = `${propertyId}:${spec.shared ? 0 : seed}`;
  let chosen = cache.get(key);

  if (chosen === undefined) {
    // Bij een eigen huis willen we iets te kiezen hebben; bij een flat juist
    // niet, want die is voor iedereen hetzelfde gebouw.
    const wanted = spec.shared ? 1 : CANDIDATES;
    const spots = frontageByLot({
      preferred: spec.preferred,
      district: spec.district,
      minLots: wanted,
      accept: (lot) => {
        if (lot.style !== spec.style) return false;
        if (spec.minFloors !== undefined && lot.floors < spec.minFloors) return false;
        return true;
      },
    });

    // Vindt hij niets van de juiste bouwstijl, dan liever een pand van een
    // andere stijl in de goede wijk dan helemaal geen adres: een speler zonder
    // voordeur kan nergens naar binnen.
    const pool =
      spots.length > 0
        ? spots
        : frontageByLot({ preferred: spec.preferred, district: spec.district, minLots: wanted });

    chosen = pool[spec.shared ? 0 : pick(seed, Math.min(CANDIDATES, pool.length))] ?? null;
    cache.set(key, chosen);
  }
  if (!chosen) return null;

  return {
    propertyId,
    x: chosen.x,
    z: chosen.z,
    rotY: chosen.rotY,
    district: spec.district,
    street: spec.street,
    // Huisnummer als 3-B: verdieping plus letter, uit je eigen seed.
    unit: spec.shared ? `${1 + pick(seed, 8)}-${'ABCD'[pick(seed + 7, 4)]}` : '',
    lot: chosen.lot,
  };
}

/** Sta je voor de deur van deze woning? */
export function atDoor(
  propertyId: string,
  seed: number,
  x: number,
  z: number,
  tolerance = 0,
): boolean {
  const address = homeAddress(propertyId, seed);
  if (!address) return false;
  return Math.hypot(address.x - x, address.z - z) <= DOOR_REACH + tolerance;
}

/**
 * De adressen die er voor jou toe doen: waar je nu woont, plus de woningen die
 * te koop staan.
 *
 * Alleen de eerstvolgende paar tiers krijgen een bord. Anders hangt de halve
 * stad vol met bordjes voor een landhuis van zesentwintig miljoen.
 */
export function relevantAddresses(
  currentPropertyId: string,
  seed: number,
  aheadTiers = 2,
): { address: HomeAddress; owned: boolean; forSale: boolean }[] {
  const currentTier = getProperty(currentPropertyId).tier;
  const out: { address: HomeAddress; owned: boolean; forSale: boolean }[] = [];

  for (const property of PROPERTIES) {
    const ahead = property.tier - currentTier;
    if (ahead < 0 || ahead > aheadTiers) continue;
    const address = homeAddress(property.id, seed);
    if (!address) continue;
    out.push({ address, owned: ahead === 0, forSale: ahead > 0 });
  }
  return out;
}
