/**
 * Testgereedschap dat alleen in de app leeft: de klok van de stad en de
 * meetgegevens van de renderer.
 *
 * Net als de spelerpositie staat dit buiten React. De klok wordt elke frame
 * uitgelezen en de meetwaarden worden elke frame geschreven; zou dit
 * React-state zijn, dan hertekende de hele UI zestig keer per seconde.
 */

/**
 * Een vast uur voor de dag- en nachtcyclus, of `null` voor de echte klok van
 * het toestel. Handig om de avondverlichting te bekijken zonder tot vanavond
 * te wachten.
 */
export const worldClock = { hour: null as number | null };

/** Wat de renderer de afgelopen frame heeft gedaan. */
export const renderStats = {
  fps: 0,
  /** Tekenopdrachten: de beste maat voor "waarom is dit traag". */
  calls: 0,
  triangles: 0,
  /** Hoeveel shaderprogramma's er in het geheugen staan. */
  programs: 0,
};
