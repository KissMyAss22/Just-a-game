import { isParkSide, worldToCell } from './city/layout';

/**
 * Elkaar neerhalen in Het Verlaten Park.
 *
 * De regels staan hier en niet in `realtime.ts`, want dat bestand gaat over de
 * vórm van de berichten en dit over wat er wel en niet mag. Ze staan in gedeelde
 * code zodat de app een knop kan uitzetten met exact dezelfde redenering waarmee
 * de server hem zou weigeren — anders krijg je een knop die soms werkt en soms
 * niet, zonder dat iemand kan zien waarom.
 *
 * De server blijft de baas. Alles hieronder wordt daar opnieuw getoetst, tegen
 * posities die de server zélf bijhoudt; wat de client meldt is een póging, geen
 * uitkomst.
 */

/** Waar je mee begint, en het maximum. */
export const MAX_HP = 100;

/** Hoe dicht je bij iemand moet staan om te kunnen slaan, in meters. */
export const ATTACK_REACH = 2.5;

/** Minimale tijd tussen twee klappen, in milliseconden. */
export const ATTACK_COOLDOWN_MS = 1_200;

/**
 * Wat één klap kost.
 *
 * Drie klappen om iemand neer te halen, en met de cadans hierboven duurt dat
 * dus ruim drie seconden aanhoudend contact. Lang genoeg om weg te kunnen
 * rennen als je oplet, kort genoeg om spannend te blijven. Eén klap zou een
 * hinderlaag onvermijdelijk maken; tien zou een gevecht een uithoudingstest
 * maken op een telefoon met een joystick.
 */
export const ATTACK_DAMAGE = 34;

/**
 * Waarom een aanval niet mag. `ok` is de enige waarde waarbij hij doorgaat.
 *
 * Een reden en niet alleen true/false, zodat de app kan uitleggen wat er aan de
 * hand is in plaats van een knop te tonen die niets doet.
 */
export type AttackVerdict = 'ok' | 'buiten_bereik' | 'te_snel' | 'niet_in_het_park' | 'al_neer';

/**
 * Mag hier gevochten worden?
 *
 * Alleen op de parkzijde: het park zelf én de landtong ernaartoe. In de stad
 * gebeurt er niets als je op de knop drukt. Dat is geen regel die gehandhaafd
 * moet worden maar gewoon de vorm van de kaart — dezelfde `isParkSide` die ook
 * bepaalt waar je buit in je buidel valt in plaats van in je rugzak.
 */
export function inPvpZone(x: number, z: number): boolean {
  const cel = worldToCell(x, z);
  return isParkSide(cel.cx, cel.cz);
}

export interface AttackInput {
  attacker: { x: number; z: number };
  target: { x: number; z: number; hp: number };
  /** Hoe lang geleden de aanvaller voor het laatst sloeg, in milliseconden. */
  sinceLastAttackMs: number;
}

/**
 * Mag deze klap doorgaan?
 *
 * Allebei de spelers moeten op de parkzijde staan. Niet alleen de aanvaller:
 * anders kun je vanaf de landtong iemand raken die net weer in de stad staat, en
 * dan is "de stad is veilig" geen belofte meer.
 */
export function judgeAttack(input: AttackInput): AttackVerdict {
  const { attacker, target, sinceLastAttackMs } = input;
  if (target.hp <= 0) return 'al_neer';
  if (!inPvpZone(attacker.x, attacker.z) || !inPvpZone(target.x, target.z)) {
    return 'niet_in_het_park';
  }
  if (Math.hypot(target.x - attacker.x, target.z - attacker.z) > ATTACK_REACH) {
    return 'buiten_bereik';
  }
  // Te snel melden wordt genegeerd, niet bestraft: een haperende verbinding die
  // twee berichten tegelijk aflevert is geen valsspelen.
  if (sinceLastAttackMs < ATTACK_COOLDOWN_MS) return 'te_snel';
  return 'ok';
}

/** Wat er van iemands hp overblijft na een klap. */
export function applyDamage(hp: number, damage = ATTACK_DAMAGE): number {
  return Math.max(0, hp - damage);
}
