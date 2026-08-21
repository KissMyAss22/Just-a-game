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
  /**
   * De langste frame van de afgelopen seconde, in milliseconden.
   *
   * Dit getal moest erbij. `fps` is een voortschrijdend gemiddelde met factor
   * 0,9, en daar verdwijnt één stilstand van 650 milliseconden vrijwel volledig
   * in — terwijl dát nou juist is waar je last van hebt. Een gemiddelde verbergt
   * precies datgene wat je voelt. Alles boven de 33 ms is een gemiste frame.
   */
  worstFrameMs: 0,
  /** Tekenopdrachten: de beste maat voor "waarom is dit traag". */
  calls: 0,
  triangles: 0,
  /** Hoeveel shaderprogramma's er in het geheugen staan. */
  programs: 0,
  /**
   * Hoeveel routes er de afgelopen seconde zijn uitgerekend, en wat de laatste
   * kostte. Drie losse aanroepers deden er samen vier tot zes per seconde; hier
   * hoort nu hooguit een enkele piek te staan als je een bestemming kiest.
   */
  routesPerSec: 0,
  routeMs: 0,
  /**
   * Hoeveel per-item meshes het lootveld op dit moment aanhoudt.
   *
   * Hoort te stabiliseren op wat er nú ligt. Loopt het op richting het aantal
   * itemsoorten in het spel, dan bouwt de scene zich weer vol.
   */
  lootMeshes: 0,
};
