import { z } from 'zod';

/**
 * De gedeelde wereld: zien waar andere spelers lopen en rijden.
 *
 * Het protocol staat hier zodat client en server letterlijk dezelfde vorm
 * gebruiken, net als bij de stadslayout en het rijmodel. De berichten worden
 * aan beide kanten door zod gehaald; een verbinding die iets anders stuurt dan
 * dit wordt gesloten in plaats van half begrepen.
 *
 * Bewust géén Colyseus, terwijl het plan dat wel noemde. De toestand is klein
 * — een handvol spelers met zes getallen — en de winst van Colyseus zit in
 * delta-encoding en matchmaking die we hier geen van beide nodig hebben. Een
 * platte WebSocket in hetzelfde Fastify-proces scheelt een grote afhankelijkheid
 * en houdt het protocol leesbaar. Wordt het later druk of complex, dan is dit
 * bestand de enige plek die om moet.
 */

export const REALTIME = {
  /** Pad van de WebSocket op dezelfde server en poort als de REST-API. */
  path: '/ws',
  /** Hoe vaak de server een momentopname stuurt. */
  tickHz: 10,
  /** Hoe vaak de client zijn eigen positie meldt. */
  reportHz: 10,
  /** Binnen deze straal zie je andere spelers, in meters. */
  interestRadius: 170,
  /** Zoveel andere spelers tegelijk in beeld; de dichtstbijzijnde winnen. */
  maxVisible: 24,
  /** Meer berichten per seconde dan dit en de verbinding gaat dicht. */
  maxMessagesPerSecond: 30,
  /** Zonder bericht binnen deze tijd beschouwt de server je als weg. */
  timeoutMs: 30_000,
} as const;

/**
 * Hoeveel sneller iemand kortstondig mag lijken te gaan dan zijn topsnelheid.
 *
 * Een telefoon meldt niet op een vast ritme en pakketten komen soms in een
 * bosje binnen; zonder speling zou een haperende verbinding als valsspelen
 * worden gelezen. De marge is bewust ruim genoeg voor netwerkgehik en te krap
 * om er iets mee te winnen.
 */
export const SPEED_ALLOWANCE = 1.6;

/**
 * Hoe ver iemand in deze tijd gekomen kan zijn.
 *
 * Deze formule staat op één plek omdat hij op drie plekken gebruikt wordt: bij
 * het melden van je positie, bij het oprapen van een item, en bij de gedeelde
 * wereld. Liepen die uiteen, dan zou een actie die de ene laag goedkeurt door
 * de andere geweigerd worden.
 */
export function moveBudget(
  topSpeed: number,
  elapsedSeconds: number,
  tolerance: number,
  /** Ruimte voor het ontwikkelgereedschap; standaard geen. */
  allowance = SPEED_ALLOWANCE,
): number {
  return topSpeed * allowance * Math.max(0, elapsedSeconds) + tolerance;
}

/**
 * Hoeveel speling het ontwikkelgereedschap krijgt.
 *
 * Ruim genoeg voor de vliegmodus en acht keer looptempo, en het staat alleen
 * aan op een server die je zelf hebt aangezet.
 */
export const DEV_SPEED_ALLOWANCE = 60;

/**
 * De dichtstbijzijnde spelers binnen het zichtgebied.
 *
 * Bij drukte winnen de dichtstbijzijnde: iemand vlak naast je zien lopen is
 * belangrijker dan iemand aan de andere kant van de wijk, en het houdt de
 * momentopname klein.
 */
export function withinInterest<T extends { x: number; z: number }>(
  self: { x: number; z: number },
  others: readonly T[],
  radius: number = REALTIME.interestRadius,
  max: number = REALTIME.maxVisible,
): T[] {
  const found: { item: T; distance: number }[] = [];
  for (const other of others) {
    const distance = Math.hypot(other.x - self.x, other.z - self.z);
    if (distance > radius) continue;
    found.push({ item: other, distance });
  }
  found.sort((a, b) => a.distance - b.distance);
  return found.slice(0, max).map((entry) => entry.item);
}

/** Client → server: waar sta ik nu. */
export const moveMessageSchema = z.object({
  t: z.literal('move'),
  x: z.number().finite(),
  z: z.number().finite(),
  /** Kijkrichting in radialen. */
  h: z.number().finite(),
  /** 1 als je in je voertuig zit. */
  d: z.union([z.literal(0), z.literal(1)]),
});

/**
 * Client → server: ik probeer die daar te raken.
 *
 * Meer staat er bewust niet in. Geen schade, geen positie, geen "ik heb
 * geraakt" — dat zou de client laten bepalen wat er gebeurt. Dit is een póging;
 * de server kijkt naar de posities die hij zélf bijhoudt en beslist. Dezelfde
 * scheiding als bij verkopen: je kunt niet beweren dat je ergens staat.
 */
export const attackMessageSchema = z.object({
  t: z.literal('attack'),
  /** Het id van de speler die je probeert te raken. */
  target: z.string().min(1).max(64),
});

export const clientMessageSchema = z.discriminatedUnion('t', [
  moveMessageSchema,
  attackMessageSchema,
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

/**
 * Eén andere speler in een momentopname. De veldnamen zijn kort omdat dit
 * tien keer per seconde over de lijn gaat.
 */
export interface RemotePlayer {
  id: string;
  /** Weergavenaam. */
  n: string;
  x: number;
  z: number;
  /** Kijkrichting in radialen. */
  h: number;
  /** 1 als deze speler rijdt. */
  d: 0 | 1;
  /** Voertuig-id; ook zichtbaar als hij er niet in zit, want hij staat ernaast. */
  v: string;
  level: number;
  /** Uiterlijk: huidskleur, kleding, accent — indexen uit @game/shared. */
  s: number;
  o: number;
  a: number;
  /**
   * Levenspunten, 0 tot `MAX_HP`.
   *
   * Gaat bij elke momentopname mee, ook in de stad waar er niets mee gebeurt.
   * Twee bytes per speler is minder dan de administratie die nodig zou zijn om
   * hem alleen in het park mee te sturen.
   */
  hp: number;
}

export interface WelcomeMessage {
  t: 'welcome';
  /** Je eigen id, zodat je jezelf uit de momentopname kunt filteren. */
  id: string;
  /** Servertijd, zodat de client zijn klok kan gelijkzetten. */
  now: number;
}

export interface SnapshotMessage {
  t: 'snapshot';
  /** Servertijd waarop deze momentopname is gemaakt. */
  at: number;
  players: RemotePlayer[];
}

/**
 * Server → client: je bent neergegaan.
 *
 * Komt alleen bij degene die neerging. Wie de klap uitdeelde ziet het vanzelf,
 * want de ander verdwijnt uit zijn buurt.
 */
export interface DownedMessage {
  t: 'downed';
  /** De naam van wie je neerhaalde. */
  by: string;
  /** Hoeveel stuks buit er uit je buidel op de grond zijn gevallen. */
  lost: number;
  /** Waar je opnieuw begint: aan de stadskant van de landtong. */
  x: number;
  z: number;
}

export type ServerMessage = WelcomeMessage | SnapshotMessage | DownedMessage;

/**
 * Naam en uiterlijk gaan bij elke momentopname mee in plaats van één keer bij
 * het binnenkomen. Dat is een paar honderd bytes per seconde meer, en het
 * scheelt aan beide kanten een administratie van "wie kent wie al". Bij
 * tientallen spelers is dat de goede ruil; bij honderden niet meer.
 */
export function snapshotSize(players: number): number {
  return players * 95;
}
