import { describe, expect, it } from 'vitest';
import { districtAtWorld, isWalkable, spawnPosition } from '../src/city/layout';
import { distanceToRoadAxis, isAsphalt } from '../src/city/streets';
import {
  PAWN_SHOPS,
  SHOP_REACH,
  atShop,
  nearestShop,
  shopSpot,
  shopSpots,
} from '../src/shops';

/**
 * De winkels zijn de enige plek waar je kunt verkopen, dus als er ééntje in
 * een muur of op de rijbaan staat is dat geen schoonheidsfoutje maar een
 * doodlopende weg. De plek wordt gezocht in plaats van ingetypt; deze tests
 * controleren of die zoektocht ook echt iets bruikbaars oplevert.
 */
describe('pandjeshuizen', () => {
  it('vindt voor elke winkel een plek', () => {
    expect(shopSpots()).toHaveLength(PAWN_SHOPS.length);
  });

  it('zet ze op begaanbare stoep, niet op de rijbaan', () => {
    for (const spot of shopSpots()) {
      expect({ id: spot.id, asfalt: isAsphalt(spot.x, spot.z) }).toEqual({
        id: spot.id,
        asfalt: false,
      });
      expect({ id: spot.id, loopbaar: isWalkable(spot.x, spot.z, 0.45) }).toEqual({
        id: spot.id,
        loopbaar: true,
      });
      // In de stoepband: voorbij de stoeprand op 3,0 m en binnen de gevel op 4,6 m.
      const fromAxis = Math.min(distanceToRoadAxis(spot.x), distanceToRoadAxis(spot.z));
      expect(fromAxis).toBeGreaterThanOrEqual(3.4);
      expect(fromAxis).toBeLessThanOrEqual(4.5);
    }
  });

  it('zet ze in de wijk waar ze horen', () => {
    for (const shop of PAWN_SHOPS) {
      const spot = shopSpot(shop);
      expect(spot).not.toBeNull();
      expect(districtAtWorld(spot!.x, spot!.z).id).toBe(shop.district);
    }
  });

  it('spreidt ze over de kaart in plaats van ze op een kluitje te zetten', () => {
    const spots = shopSpots();
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const distance = Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.z - spots[j]!.z);
        expect(distance).toBeGreaterThan(250);
      }
    }
  });

  /**
   * Het punt van drie winkels in plaats van één: nergens in de stad mag je zo
   * ver van een winkel staan dat een volle rugzak een straf wordt.
   */
  it('houdt overal in de stad een winkel binnen loopafstand', () => {
    let worst = 0;
    for (let x = -500; x <= 500; x += 25) {
      for (let z = -500; z <= 500; z += 25) {
        if (!isWalkable(x, z, 0.45)) continue;
        const near = nearestShop(x, z);
        expect(near).not.toBeNull();
        worst = Math.max(worst, near!.distance);
      }
    }
    expect(worst).toBeLessThan(700);
  });

  it('heeft er eentje vlak bij het startpunt staan', () => {
    const start = spawnPosition();
    const near = nearestShop(start.x, start.z);
    expect(near!.distance).toBeLessThan(120);
  });

  it('laat je pas handelen als je er echt naast staat', () => {
    const spot = shopSpots()[0]!;
    expect(atShop(spot.x, spot.z)).toBe(true);
    expect(atShop(spot.x + SHOP_REACH - 1, spot.z)).toBe(true);
    expect(atShop(spot.x + SHOP_REACH + 5, spot.z)).toBe(false);
  });
});
