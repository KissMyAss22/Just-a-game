import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CITY, PARK_BOUNDS, cellToWorld, kaartStempel, shopSpots, spawnPosition } from '../src/index';

/**
 * De stadskaart is vooraf getekend en gaat als afbeelding mee met de app.
 *
 * Dat is de goede keuze — straten, bouwblokken en een kustlijn zijn te veel
 * vormen om op een telefoon live te tekenen — maar het brengt één risico mee:
 * verandert de stad en tekent niemand de plaat opnieuw, dan loop je maandenlang
 * met een kaart van een stad die niet meer bestaat. Deze test is die bewaking.
 *
 * Valt hij om, draai dan `pnpm preview`. Dat tekent de plaat en het stempel
 * opnieuw uit de huidige stadsdata.
 */

const hier = dirname(fileURLToPath(import.meta.url));
const stempel = JSON.parse(
  readFileSync(join(hier, '../../../apps/mobile/assets/stadskaart.json'), 'utf8'),
) as {
  seed: number;
  gridSize: number;
  cellSize: number;
  originCell: number;
  size: number;
  perMeter: number;
  parkX0: number;
  special: string;
};

describe('de stadskaart die de app meekrijgt', () => {
  it('hoort bij déze stad', () => {
    expect({
      seed: stempel.seed,
      gridSize: stempel.gridSize,
      cellSize: stempel.cellSize,
      originCell: stempel.originCell,
      parkX0: stempel.parkX0,
    }).toEqual({
      seed: CITY.seed,
      gridSize: CITY.gridSize,
      cellSize: CITY.cellSize,
      originCell: CITY.originCell,
      parkX0: PARK_BOUNDS.x0,
    });
  });

  /**
   * En bij dézelfde bijzondere gebieden.
   *
   * Dit hoorde er vanaf het begin bij en zat er niet in. Het stempel bestond uit
   * maten, en geen van die maten verandert als er een park of een plein in de
   * stad komt. Toen het stadspark en het marktplein erbij kwamen bleef het
   * stempelbestand dan ook byte-identiek terwijl de plaat wél anders was — de
   * bewaking zou dus groen zijn gebleven met een kaart zonder park erop.
   */
  it('hoort bij dezelfde parken en pleinen', () => {
    expect(stempel.special).toBe(kaartStempel(stempel.perMeter).special);
  });

  it('is vierkant en dekt de hele wereld', () => {
    expect(stempel.size).toBe(Math.round(CITY.gridSize * CITY.cellSize * stempel.perMeter));
  });

  /**
   * Dit is de klacht "wat ik zie klopt niet met waar ik loop", uitgeschreven
   * als som. `toMap` in de app doet exact deze omrekening; klopt die, dan staat
   * elke marker op de plek waar hij in de wereld ook staat.
   */
  it('zet bekende punten op de juiste plek', () => {
    const venster = 300;
    const toMap = (world: number): number =>
      ((world / CITY.cellSize + CITY.originCell) / CITY.gridSize) * venster;

    // Het startpunt ligt in cel 64,64 — de oorsprong — maar `spawnPosition`
    // geeft het mídden van die cel. Die halve cel hoort er dus bij, en juist
    // zo'n halve cel is wat er stilletjes misgaat bij een omrekening.
    const start = spawnPosition();
    expect(toMap(start.x)).toBeCloseTo(((CITY.originCell + 0.5) / CITY.gridSize) * venster, 4);
    expect(toMap(start.z)).toBeCloseTo(((CITY.originCell + 0.5) / CITY.gridSize) * venster, 4);

    // Elk pandjeshuis valt binnen het venster, en geen twee vallen samen.
    const punten = shopSpots().map((winkel) => ({
      id: winkel.id,
      x: Math.round(toMap(winkel.x)),
      z: Math.round(toMap(winkel.z)),
    }));
    for (const punt of punten) {
      expect({ id: punt.id, binnen: punt.x >= 0 && punt.x <= venster }).toEqual({
        id: punt.id,
        binnen: true,
      });
    }
    expect(new Set(punten.map((p) => `${p.x}:${p.z}`)).size).toBe(punten.length);

    // En de landtong ligt rechts van de stad, zoals op de plaat.
    const landtong = cellToWorld(PARK_BOUNDS.x0, 62);
    expect(toMap(landtong.x)).toBeGreaterThan(toMap(start.x));
  });
});
