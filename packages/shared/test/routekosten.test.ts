import { describe, expect, it } from 'vitest';
import { CITY, cellToWorld, districtAtWorld, isWalkable, isWaterCell, spawnPosition } from '../src/city/layout';
import { findRoute } from '../src/route';
import { shopSpots } from '../src/shops';

/**
 * Wat een route mag kosten.
 *
 * Dit is een bewaking en geen stopwatch. De aanleiding: navigeren maakte het
 * spel onspeelbaar, en gemeten kostte één zoektocht 654 milliseconden dwars over
 * de kaart en 1.900 naar het privé-eiland. De oorzaken waren een wachtrij die
 * lineair naar zijn minimum zocht, `isWalkable` dat vijfentwintig keer per cel
 * een pand uitrekende, en een zoektocht die vierentwintigduizend cellen leeg
 * liep voordat hij mocht opgeven bij iets wat onbereikbaar is.
 *
 * Na de reparatie is de duurste route 1,3 ms. De grenzen hieronder liggen daar
 * een orde van grootte boven, en dat is opzet: een test die op tienden van
 * milliseconden let, valt om op een trage machine en zegt dan niets. Deze valt
 * pas om als er iets structureels terugkomt — en dát is wat je wil weten.
 */

/** Een begaanbare cel op het privé-eiland: die is helemaal omsloten door zee. */
function eilandPunt(): { x: number; z: number } | null {
  for (let cx = 0; cx < CITY.gridSize; cx++) {
    for (let cz = 0; cz < CITY.gridSize; cz++) {
      if (isWaterCell(cx, cz)) continue;
      const wereld = cellToWorld(cx, cz);
      if (districtAtWorld(wereld.x, wereld.z).id !== 'island') continue;
      if (!isWalkable(wereld.x, wereld.z, 0.45)) continue;
      return wereld;
    }
  }
  return null;
}

/** De mediaan van een paar metingen; één losse meting is ruis. */
function kosten(van: { x: number; z: number }, naar: { x: number; z: number }): number {
  const metingen: number[] = [];
  for (let i = 0; i < 5; i++) {
    const begin = performance.now();
    findRoute(van, naar);
    metingen.push(performance.now() - begin);
  }
  metingen.sort((a, b) => a - b);
  return metingen[2]!;
}

describe('wat een route mag kosten', () => {
  const start = spawnPosition();

  // De állereerste aanroep bouwt het begaanbare raster van de hele stad. Dat is
  // eenmalig werk en hoort niet in een meting van "wat kost een route".
  findRoute(start, { x: start.x + 40, z: start.z + 40 });

  it('vindt een winkel ruim binnen een frame', () => {
    for (const winkel of shopSpots()) {
      const ms = kosten(start, { x: winkel.x, z: winkel.z });
      expect({ winkel: winkel.id, binnenBudget: ms < 20 }).toEqual({
        winkel: winkel.id,
        binnenBudget: true,
      });
    }
  });

  it('haalt ook de overkant van de kaart', () => {
    // Van het startpunt naar het Verlaten Park is ruim 750 meter: het verste dat
    // je te voet kunt afleggen, en dus het duurste dat de zoeker moet kunnen.
    expect(kosten(start, cellToWorld(140, 64))).toBeLessThan(30);
  });

  it('geeft meteen op als er geen route is', () => {
    // Het eiland ligt los in zee. Vroeger liep de zoeker hier eerst een half
    // stadsraster leeg; nu ziet hij aan het gebiednummer dat het niet kan.
    const eiland = eilandPunt();
    expect(eiland).not.toBeNull();
    const route = findRoute(start, eiland!);
    expect(route.bereikbaar).toBe(false);
    expect(kosten(start, eiland!)).toBeLessThan(5);
  });
});
