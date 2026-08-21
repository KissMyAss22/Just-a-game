import { CITY, PARK_BOUNDS, SPECIAL_AREAS } from './layout';

/**
 * Het stempel van de vooraf getekende stadskaart.
 *
 * De kaart in de telefoon is één plaat, getekend uit de stadsdata en als
 * afbeelding meegeleverd. Dat kan niet verouderen tijdens het spelen — de stad
 * is deterministisch — maar wél tussen versies door: verandert de generator en
 * tekent niemand de plaat opnieuw, dan loop je met een kaart van een stad die
 * niet meer bestaat. Dit stempel is die bewaking.
 *
 * Waarom het hier staat en niet in het tekenscript: het stond op twéé plekken.
 * `scripts/preview/citymap.ts` zette er een in `document.title` die nooit
 * gelezen werd, en `scripts/render-preview.mjs` had zijn eigen kopie die het
 * bestand daadwerkelijk schreef. Twee definities van dezelfde waarheid gaan uit
 * elkaar lopen, en dat gebeurde ook: toen het stadspark en het marktplein erbij
 * kwamen bleef het stempel byte-identiek, want het bestond alleen uit maten. De
 * bewaking was dus stil op precies de verandering die hij hoorde te zien.
 */
export interface Kaartstempel {
  seed: number;
  gridSize: number;
  cellSize: number;
  originCell: number;
  /** De plaat is vierkant; dit is de zijde in pixels. */
  size: number;
  /** Hoeveel pixels er op een wereldmeter gaan. */
  perMeter: number;
  parkX0: number;
  /**
   * De bijzondere gebieden platgeslagen tot één regel. Zonder dit veld ziet het
   * stempel het verschil niet tussen een stad met en zonder park.
   */
  special: string;
}

/**
 * De gebieden op id gesorteerd en tot tekst gemaakt, zodat de volgorde waarin ze
 * in `SPECIAL_AREAS` staan niet meetelt: het gaat om wat er staat.
 */
function specialAreasStempel(): string {
  return [...SPECIAL_AREAS]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((vak) => `${vak.id}:${vak.kind}:${vak.x0},${vak.z0},${vak.x1},${vak.z1}`)
    .join('|');
}

export function kaartStempel(perMeter: number): Kaartstempel {
  return {
    seed: CITY.seed,
    gridSize: CITY.gridSize,
    cellSize: CITY.cellSize,
    originCell: CITY.originCell,
    size: Math.round(CITY.gridSize * CITY.cellSize * perMeter),
    perMeter,
    parkX0: PARK_BOUNDS.x0,
    special: specialAreasStempel(),
  };
}
