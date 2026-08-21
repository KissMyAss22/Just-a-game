import { findRoute, type Route as SharedRoute } from '@game/shared';

/**
 * De positie van de speler verandert elke frame. Zou die in React-state
 * staan, dan zou de hele UI 60 keer per seconde opnieuw renderen. Daarom
 * leeft hij hier, buiten React, en leest zowel de 3D-scene als de netwerklaag
 * dit object rechtstreeks.
 */
export const playerPosition = { x: 0, z: 0 };

/**
 * Kijkrichting van de camera in radialen; bepaalt ook de looprichting.
 *
 * `userYawAt` is het moment waarop de speler zelf voor het laatst heeft
 * gedraaid. Tijdens het rijden zwenkt de camera vanzelf achter de auto, maar
 * pas als de speler even niet aan het kijken is — anders vecht de camera met
 * je duim.
 */
export const cameraState = { yaw: Math.PI * 0.25, distance: 15, height: 9, userYawAt: 0 };

/**
 * De stand van het voertuig waar je in rijdt. Staat hier en niet in React om
 * dezelfde reden als de spelerpositie: dit verandert elke frame.
 */
export const driveState = { x: 0, z: 0, heading: 0, speed: 0, steer: 0, braking: false };

/** Actuele stand van de joystick, -1..1 per as. */
export const moveInput = { x: 0, y: 0, active: false };

/**
 * De vliegmodus uit het ontwikkelgereedschap: hoe hoog je hangt, en of je
 * stijgt of daalt. Staat hier omdat het elke frame verandert.
 */
export const flyInput = { altitude: 0, climb: 0 };

/**
 * Waar de speler naartoe wil, of null als er geen bestemming is.
 *
 * Staat hier omdat de HUD de richting elke frame opnieuw moet uitrekenen. De
 * winkelwijzer vult hem nu automatisch met het dichtstbijzijnde pandjeshuis
 * zodra je rugzak vol raakt; straks kan de kaart er ook een bestemming in
 * zetten. Eén wijzer, meerdere bronnen — twee pijlen op één scherm is geen
 * navigatie meer.
 */
export interface NavigationTarget {
  x: number;
  z: number;
  label: string;
}

export const navigationTarget: { current: NavigationTarget | null } = { current: null };

/**
 * De berekende route naar die bestemming — één keer, voor iedereen.
 *
 * Hier stonden drie losse berekeningen: het lint op straat, de wijzer in de HUD
 * en de lijn op de kaart riepen alle drie hun eigen `findRoute` aan. De HUD deed
 * dat vier keer per seconde, terwijl het commentaar erboven letterlijk zei dat
 * dat niet moest. Gemeten kostte één zoektocht dwars over de kaart 654
 * milliseconden en naar het privé-eiland 1.900; vier per seconde is dan meer
 * werk dan er tijd is.
 *
 * De zoeker is inmiddels een factor honderd sneller, maar dat is niet de reden
 * dat dit hier staat. Drie plekken die hetzelfde uitrekenen kunnen uit elkaar
 * gaan lopen, en dan wijst je telefoon een andere kant op dan de lijn voor je
 * voeten. Eén berekening, drie lezers.
 *
 * `Route.tsx` is de enige die hem vult; de HUD en de kaart lezen alleen.
 */
export const routeStore: {
  current: SharedRoute | null;
  /** Het label van de bestemming waar `current` bij hoort. */
  doel: string | null;
  /** Wat de laatste zoektocht kostte, in milliseconden. Voor de meter. */
  kosten: number;
  /** Hoeveel zoektochten er sinds het starten gedaan zijn. Voor de meter. */
  aantal: number;
} = { current: null, doel: null, kosten: 0, aantal: 0 };

/** Een klok met meer dan milliseconden, waar het toestel er een heeft. */
const nu = (): number => globalThis.performance?.now?.() ?? Date.now();

/**
 * De route opnieuw uitrekenen. Roep dit niet aan vanuit een frame: de állereerste
 * aanroep bouwt het begaanbare raster van de hele stad, en dat kost eenmalig
 * tientallen milliseconden.
 */
export function vernieuwRoute(doel: NavigationTarget): void {
  const begin = nu();
  const route = findRoute(
    { x: playerPosition.x, z: playerPosition.z },
    { x: doel.x, z: doel.z },
  );
  routeStore.kosten = nu() - begin;
  routeStore.aantal += 1;
  routeStore.current = route;
  routeStore.doel = doel.label;
}

/** De route vergeten, bijvoorbeeld als de bestemming losgelaten wordt. */
export function wisRoute(): void {
  routeStore.current = null;
  routeStore.doel = null;
}

/** Afstand die nog niet naar de server is gemeld. */
export const travelBuffer = { meters: 0 };

export function setPlayerPosition(x: number, z: number): void {
  playerPosition.x = x;
  playerPosition.z = z;
}
