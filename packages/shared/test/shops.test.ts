import { describe, expect, it } from 'vitest';
import { districtAtWorld, isWalkable, spawnPosition, specialAreaAt, worldToCell } from '../src/city/layout';
import { distanceToRoadAxis, isAsphalt } from '../src/city/streets';
import {
  MARKET_STALLS,
  PAWN_SHOPS,
  marketStalls,
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
    // Twee soorten: een pui tegen een gevel, en een kraam op het marktplein.
    const bezetteKramen = marketStalls().filter((kraam) => kraam.shopId !== null);
    expect(shopSpots()).toHaveLength(PAWN_SHOPS.length + bezetteKramen.length);
  });

  it('zet elke winkel op begaanbaar terrein, nooit op de rijbaan', () => {
    for (const spot of shopSpots()) {
      expect({ id: spot.id, asfalt: isAsphalt(spot.x, spot.z) }).toEqual({
        id: spot.id,
        asfalt: false,
      });
      expect({ id: spot.id, loopbaar: isWalkable(spot.x, spot.z, 0.45) }).toEqual({
        id: spot.id,
        loopbaar: true,
      });
    }
  });

  it('zet een winkelpui in de stoepband voor het pand', () => {
    // Alleen voor de puien. Een kraam staat midden op een plein, en die hoort
    // juist níét tegen een gevel te staan — dat was het hele punt.
    for (const shop of PAWN_SHOPS) {
      const spot = shopSpot(shop)!;
      const fromAxis = Math.min(distanceToRoadAxis(spot.x), distanceToRoadAxis(spot.z));
      expect({ id: spot.id, band: fromAxis >= 3.4 && fromAxis <= 4.5 }).toEqual({
        id: spot.id,
        band: true,
      });
    }
  });

  it('zet de kramen op het plein, op een rij, met ruimte voor later', () => {
    const kramen = marketStalls();
    expect(kramen).toHaveLength(MARKET_STALLS);
    // Minstens één plek is nog vrij: daar was de rij voor.
    expect(kramen.some((kraam) => kraam.shopId === null)).toBe(true);
    for (const kraam of kramen) {
      const cel = worldToCell(kraam.x, kraam.z);
      expect({ slot: kraam.slot, opHetPlein: specialAreaAt(cel.cx, cel.cz)?.id ?? null }).toEqual({
        slot: kraam.slot,
        opHetPlein: 'plein',
      });
      expect({ slot: kraam.slot, loopbaar: isWalkable(kraam.x, kraam.z, 0.45) }).toEqual({
        slot: kraam.slot,
        loopbaar: true,
      });
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
   * Met twee winkels in plaats van drie wordt de verste hoek verder weg. Dat is
   * een bewuste ruil: minder winkels die er tóevallig staan, meer winkels die
   * ergens hóren. Gemeten is het verste punt de Jachthaven op 773 meter — ruim
   * twee minuten lopen, en veel minder met een voertuig. De grens hieronder ligt
   * daar net boven; wordt het meer, dan is dat een keuze die je bewust maakt en
   * geen sluipende verslechtering.
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
    expect(worst).toBeLessThan(850);
  });

  it('heeft er eentje op loopafstand van het startpunt', () => {
    // Het marktplein ligt een paar straten ten noorden van waar je begint:
    // gemeten 186 meter, ofwel een halve minuut lopen. Ver genoeg om een
    // wandeling te zijn, dichtbij genoeg om je eerste rugzak kwijt te kunnen.
    const start = spawnPosition();
    const near = nearestShop(start.x, start.z);
    expect(near!.distance).toBeLessThan(250);
  });

  it('laat je pas handelen als je er echt naast staat', () => {
    const spot = shopSpots()[0]!;
    expect(atShop(spot.x, spot.z)).toBe(true);
    expect(atShop(spot.x + SHOP_REACH - 1, spot.z)).toBe(true);
    expect(atShop(spot.x + SHOP_REACH + 5, spot.z)).toBe(false);
  });
});
