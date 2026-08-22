import { describe, expect, it } from 'vitest';
import {
  ATTACK_COOLDOWN_MS,
  ATTACK_DAMAGE,
  ATTACK_REACH,
  MAX_HP,
  applyDamage,
  inPvpZone,
  judgeAttack,
} from '../src/combat';
import { PARK_BOUNDS, PARK_CAUSEWAY, cellToWorld, spawnPosition } from '../src/city/layout';
import { shopSpots } from '../src/shops';

/**
 * Elkaar neerhalen kan alleen in Het Verlaten Park.
 *
 * Dat is niet één regel maar een belofte: je base, je cash, je rugzak en de hele
 * stad blijven buiten schot, en alleen wat je in het park hebt opgeraapt staat op
 * het spel. Deze tests bewaken die belofte aan de rand, want daar gaat het mis —
 * op de grens tussen de landtong en de straat.
 */

const inHetPark = cellToWorld(PARK_BOUNDS.x0 + 8, 64);
const opDeLandtong = cellToWorld(PARK_CAUSEWAY.x0 + 1, PARK_CAUSEWAY.z0 + 1);

/** Twee meter uit elkaar: ruim binnen `ATTACK_REACH`. */
function naast(punt: { x: number; z: number }) {
  return { x: punt.x + 2, z: punt.z };
}

describe('waar gevochten mag worden', () => {
  it('kan in het park en op de landtong', () => {
    expect(inPvpZone(inHetPark.x, inHetPark.z)).toBe(true);
    expect(inPvpZone(opDeLandtong.x, opDeLandtong.z)).toBe(true);
  });

  it('kan nergens in de stad', () => {
    const start = spawnPosition();
    expect(inPvpZone(start.x, start.z)).toBe(false);
    for (const winkel of shopSpots()) {
      expect({ winkel: winkel.id, pvp: inPvpZone(winkel.x, winkel.z) }).toEqual({
        winkel: winkel.id,
        pvp: false,
      });
    }
  });

  /**
   * Dit is de test die er echt toe doet. Zou alleen de aanvaller in het park
   * hoeven staan, dan kun je vanaf de landtong iemand raken die net weer op
   * straat staat — en dan is "de stad is veilig" geen belofte meer maar een
   * halve waarheid.
   */
  it('vraagt van allebei dat ze aan de parkkant staan', () => {
    const stad = spawnPosition();
    const basis = { sinceLastAttackMs: ATTACK_COOLDOWN_MS * 2 };

    expect(
      judgeAttack({
        ...basis,
        attacker: opDeLandtong,
        target: { ...naast(opDeLandtong), hp: MAX_HP },
      }),
    ).toBe('ok');

    // Aanvaller in het park, doelwit in de stad.
    expect(
      judgeAttack({ ...basis, attacker: opDeLandtong, target: { ...stad, hp: MAX_HP } }),
    ).toBe('niet_in_het_park');

    // En andersom.
    expect(
      judgeAttack({ ...basis, attacker: stad, target: { ...naast(stad), hp: MAX_HP } }),
    ).toBe('niet_in_het_park');
  });
});

describe('wanneer een klap doorgaat', () => {
  const basis = {
    attacker: inHetPark,
    target: { ...naast(inHetPark), hp: MAX_HP },
  };

  it('laat er één door per cadans en niet meer', () => {
    expect(judgeAttack({ ...basis, sinceLastAttackMs: ATTACK_COOLDOWN_MS })).toBe('ok');
    expect(judgeAttack({ ...basis, sinceLastAttackMs: ATTACK_COOLDOWN_MS - 1 })).toBe('te_snel');
    expect(judgeAttack({ ...basis, sinceLastAttackMs: 0 })).toBe('te_snel');
  });

  it('houdt op bij de rand van je bereik', () => {
    const net = { x: inHetPark.x + ATTACK_REACH - 0.01, z: inHetPark.z };
    const netniet = { x: inHetPark.x + ATTACK_REACH + 0.01, z: inHetPark.z };
    const cadans = { sinceLastAttackMs: ATTACK_COOLDOWN_MS * 2 };
    expect(judgeAttack({ ...cadans, attacker: inHetPark, target: { ...net, hp: MAX_HP } })).toBe(
      'ok',
    );
    expect(
      judgeAttack({ ...cadans, attacker: inHetPark, target: { ...netniet, hp: MAX_HP } }),
    ).toBe('buiten_bereik');
  });

  it('slaat niet door op wie al neer ligt', () => {
    expect(
      judgeAttack({
        ...basis,
        target: { ...basis.target, hp: 0 },
        sinceLastAttackMs: ATTACK_COOLDOWN_MS * 2,
      }),
    ).toBe('al_neer');
  });
});

describe('hoeveel een gevecht kost', () => {
  it('haalt iemand in drie klappen neer, niet in één en niet in tien', () => {
    let hp = MAX_HP;
    let klappen = 0;
    while (hp > 0 && klappen < 20) {
      hp = applyDamage(hp);
      klappen++;
    }
    expect({ klappen, hp }).toEqual({ klappen: 3, hp: 0 });
  });

  it('geeft een gevecht genoeg tijd om weg te rennen', () => {
    // Drie klappen op deze cadans is ruim drie seconden aanhoudend contact.
    // Korter zou een hinderlaag onvermijdelijk maken.
    const secondenNodig = (3 * ATTACK_COOLDOWN_MS) / 1000;
    expect(secondenNodig).toBeGreaterThanOrEqual(3);
  });

  it('gaat nooit onder nul', () => {
    expect(applyDamage(10)).toBe(0);
    expect(applyDamage(0)).toBe(0);
    expect(ATTACK_DAMAGE).toBeGreaterThan(0);
  });
});
