import { describe, expect, it } from 'vitest';
import { ADDRESSES, atDoor, homeAddress, relevantAddresses, DOOR_REACH } from '../src/addresses';
import { districtAtWorld, isWalkable } from '../src/city/layout';
import { isAsphalt } from '../src/city/streets';
import { PROPERTIES } from '../src/properties';
import { shopSpots } from '../src/shops';

/**
 * Je woning is een pand in de stad geworden. Staat een adres in een muur, op de
 * rijbaan of in de verkeerde wijk, dan kun je niet naar binnen — en dat merk je
 * pas als je er helemaal naartoe gelopen bent.
 */
describe('woonadressen', () => {
  const seed = 12345;

  it('geeft elke woning een adres', () => {
    for (const property of PROPERTIES) {
      expect({ woning: property.id, adres: homeAddress(property.id, seed) !== null }).toEqual({
        woning: property.id,
        adres: true,
      });
    }
  });

  it('zet elke voordeur op begaanbare stoep in de bedoelde wijk', () => {
    for (const property of PROPERTIES) {
      const address = homeAddress(property.id, seed)!;
      expect({
        woning: property.id,
        loopbaar: isWalkable(address.x, address.z, 0.45),
        asfalt: isAsphalt(address.x, address.z),
        wijk: districtAtWorld(address.x, address.z).id,
      }).toEqual({
        woning: property.id,
        loopbaar: true,
        asfalt: false,
        wijk: ADDRESSES[property.id]!.district,
      });
    }
  });

  it('geeft een flat de bouwstijl die erbij hoort', () => {
    // Een appartement in een rijtjeshuis en een penthouse in een schuurtje: dat
    // is precies wat deze test tegenhoudt.
    for (const property of PROPERTIES) {
      const spec = ADDRESSES[property.id]!;
      const address = homeAddress(property.id, seed)!;
      if (!address.lot) continue;
      expect({ woning: property.id, stijl: address.lot.style }).toEqual({
        woning: property.id,
        stijl: spec.style,
      });
    }
  });

  it('geeft verschillende spelers een eigen huis', () => {
    const villas = new Set(
      [1, 2, 3, 7, 99, 4242, 31337].map((s) => {
        const a = homeAddress('villa', s)!;
        return `${Math.round(a.x)}:${Math.round(a.z)}`;
      }),
    );
    // Niet allemaal verschillend — dat hoeft niet — maar wel meer dan één.
    expect(villas.size).toBeGreaterThan(1);
  });

  it('zet iedereen in dezelfde flat, met een eigen huisnummer', () => {
    const seeds = [1, 2, 3, 7, 99];
    const plekken = new Set(
      seeds.map((s) => {
        const a = homeAddress('apartment', s)!;
        return `${Math.round(a.x)}:${Math.round(a.z)}`;
      }),
    );
    expect(plekken.size).toBe(1);

    const nummers = new Set(seeds.map((s) => homeAddress('apartment', s)!.unit));
    expect(nummers.size).toBeGreaterThan(1);
    for (const nummer of nummers) expect(nummer).toMatch(/^[1-8]-[ABCD]$/);
  });

  it('geeft een eigen huis geen huisnummer', () => {
    expect(homeAddress('villa', seed)!.unit).toBe('');
    expect(homeAddress('townhouse', seed)!.unit).toBe('');
  });

  it('zet geen voordeur bovenop een pandjeshuis', () => {
    for (const property of PROPERTIES) {
      const address = homeAddress(property.id, seed)!;
      for (const shop of shopSpots()) {
        const afstand = Math.hypot(address.x - shop.x, address.z - shop.z);
        expect({ woning: property.id, winkel: shop.id, verGenoeg: afstand > 10 }).toEqual({
          woning: property.id,
          winkel: shop.id,
          verGenoeg: true,
        });
      }
    }
  });

  it('laat je pas naar binnen als je voor de deur staat', () => {
    const address = homeAddress('townhouse', seed)!;
    expect(atDoor('townhouse', seed, address.x, address.z)).toBe(true);
    expect(atDoor('townhouse', seed, address.x + DOOR_REACH - 1, address.z)).toBe(true);
    expect(atDoor('townhouse', seed, address.x + DOOR_REACH + 5, address.z)).toBe(false);
  });

  it('hangt alleen borden bij de woningen die binnen bereik liggen', () => {
    const lijst = relevantAddresses('studio', seed);
    // Je eigen woning plus de twee eerstvolgende.
    expect(lijst.map((entry) => entry.address.propertyId)).toEqual([
      'studio',
      'apartment',
      'townhouse',
    ]);
    expect(lijst[0]!.owned).toBe(true);
    expect(lijst[0]!.forSale).toBe(false);
    expect(lijst[1]!.forSale).toBe(true);
  });

  it('kijkt niet terug naar woningen die je voorbij bent', () => {
    const lijst = relevantAddresses('villa', seed);
    expect(lijst.every((entry) => entry.address.propertyId !== 'studio')).toBe(true);
  });
});
