import { CITY, cellToWorld, isRoadCell, isWalkable, isWaterCell, worldToCell } from './city/layout';

/**
 * Een route van waar je staat naar waar je heen wil.
 *
 * Waarom dit hier staat en niet in de app: de route loopt over de wereld, en
 * die wereld is gedeelde data. Zou de app zijn eigen idee hebben van waar je
 * kunt lopen, dan tekent hij een lijn dwars door een muur die de server
 * vervolgens weigert.
 */

export interface RoutePunt {
  x: number;
  z: number;
}

export interface Route {
  /** De knikpunten, van waar je staat tot je bestemming. */
  punten: RoutePunt[];
  /** Totale lengte in meters. */
  lengte: number;
  /**
   * Loopt de route echt tot aan de bestemming?
   *
   * Bij het privé-eiland is het antwoord nee: dat ligt in zee en er is nog geen
   * boot. Dan is het eerlijker om dat te zeggen dan om een lijn het water op te
   * trekken.
   */
  bereikbaar: boolean;
}

/** Hoe ver de speler van de lijn mag raken voordat er opnieuw gerekend wordt. */
export const ROUTE_TOLERANTIE = 12;

/** Hoeveel cellen we hooguit bekijken. Voorkomt een vastloper op een eiland. */
const MAX_BEZOCHT = 24_000;

/** De straal waarmee gelopen wordt; dezelfde als in `resolveMovement`. */
const LOOPSTRAAL = 0.45;

/**
 * Wat een cel kost om doorheen te lopen.
 *
 * Zonder dit verschil neemt A* de kortste weg over álles wat begaanbaar is, en
 * dat bleek een route dwars door binnentuinen en tussen panden door. Klopt
 * volgens `isWalkable`, maar het is geen route die je herkent: je loopt over
 * straat, niet door andermans achtertuin.
 *
 * Een straat kost dus één, de rest vier. Vier en niet oneindig, want in het
 * park liggen helemaal geen straten — daar moet hij gewoon over het gras
 * kunnen. Zolang de goedkoopste stap één kost blijft de schatting hieronder
 * toelaatbaar en vindt A* nog steeds de echt kortste route.
 */
const KOSTEN_STRAAT = 1;
const KOSTEN_OVERIG = 4;

function sleutel(cx: number, cz: number): number {
  return cz * CITY.gridSize + cx;
}

/** Is deze cel begaanbaar? Gemeten in het midden, zoals je er ook loopt. */
function open(cx: number, cz: number): boolean {
  if (cx < 0 || cz < 0 || cx >= CITY.gridSize || cz >= CITY.gridSize) return false;
  if (isWaterCell(cx, cz)) return false;
  const wereld = cellToWorld(cx, cz);
  return isWalkable(wereld.x, wereld.z, LOOPSTRAAL);
}

/**
 * De dichtstbijzijnde begaanbare cel, in ringen naar buiten.
 *
 * Je staat vrijwel altijd op de stoep en niet in het midden van een cel, en een
 * bestemming is een deur of een toonbank — ook zelden een celmiddelpunt. Zonder
 * dit zou een route mislukken terwijl je er gewoon staat.
 */
function dichtstbijOpen(cx: number, cz: number, ringen = 4): { cx: number; cz: number } | null {
  if (open(cx, cz)) return { cx, cz };
  for (let r = 1; r <= ringen; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (open(cx + dx, cz + dz)) return { cx: cx + dx, cz: cz + dz };
      }
    }
  }
  return null;
}

/**
 * Vier richtingen en niet acht.
 *
 * Diagonaal lopen ziet er op een raster kort uit, maar snijdt hoeken af die in
 * de stad bebouwd zijn — en dan loopt de lijn schuin door een bouwblok terwijl
 * jij eromheen moet. Vier richtingen geeft een route die de straten volgt, en
 * dat is precies wat je wil kunnen volgen.
 */
const STAPPEN = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
] as const;

/**
 * Punten op één lijn samenvoegen.
 *
 * A* levert een reeks buurcellen op; als lijn zijn dat honderden knikjes van
 * acht meter. Alleen de hoeken doen ertoe.
 */
function vereenvoudig(punten: RoutePunt[]): RoutePunt[] {
  // Eerst dubbele punten eruit. Sta je toevallig precies op een celmiddelpunt,
  // dan levert `[van, ...cellen, naar]` twee keer hetzelfde punt op, en een
  // stukje route van nul meter heeft geen richting: alles wat daarna met die
  // richting rekent — de breedte van het lint, een camera die erlangs kijkt —
  // krijgt een nul te verwerken.
  const ontdubbeld = punten.filter(
    (punt, i) => i === 0 || Math.hypot(punt.x - punten[i - 1]!.x, punt.z - punten[i - 1]!.z) > 0.05,
  );
  if (ontdubbeld.length <= 2) return ontdubbeld;
  const punten_ = ontdubbeld;
  const uit: RoutePunt[] = [punten_[0]!];
  for (let i = 1; i < punten_.length - 1; i++) {
    const vorige = uit[uit.length - 1]!;
    const hier = punten_[i]!;
    const volgende = punten_[i + 1]!;
    const zelfdeRichting =
      Math.sign(hier.x - vorige.x) === Math.sign(volgende.x - hier.x) &&
      Math.sign(hier.z - vorige.z) === Math.sign(volgende.z - hier.z);
    if (!zelfdeRichting) uit.push(hier);
  }
  uit.push(punten_[punten_.length - 1]!);
  return uit;
}

function lengteVan(punten: RoutePunt[]): number {
  let totaal = 0;
  for (let i = 1; i < punten.length; i++) {
    totaal += Math.hypot(punten[i]!.x - punten[i - 1]!.x, punten[i]!.z - punten[i - 1]!.z);
  }
  return totaal;
}

/**
 * Zoekt een looproute met A* over het celraster.
 *
 * Ruim vijfentwintigduizend cellen klinkt veel, maar A* bekijkt er in de
 * praktijk een paar honderd. Wel te duur om elke frame te doen — vandaar
 * `ROUTE_TOLERANTIE`: pas opnieuw rekenen als je echt van de lijn af bent.
 */
export function findRoute(van: RoutePunt, naar: RoutePunt): Route {
  const startCel = worldToCell(van.x, van.z);
  const doelCel = worldToCell(naar.x, naar.z);
  const start = dichtstbijOpen(startCel.cx, startCel.cz);
  const doel = dichtstbijOpen(doelCel.cx, doelCel.cz);

  const rechtdoor: Route = {
    punten: [van, naar],
    lengte: Math.hypot(naar.x - van.x, naar.z - van.z),
    bereikbaar: false,
  };
  if (!start || !doel) return rechtdoor;

  const doelSleutel = sleutel(doel.cx, doel.cz);
  const vanwaar = new Map<number, number>();
  const kosten = new Map<number, number>([[sleutel(start.cx, start.cz), 0]]);
  // Een eenvoudige lijst als wachtrij: bij een paar honderd cellen is een
  // echte prioriteitswachtrij meer code dan hij oplevert.
  const open_: { cx: number; cz: number; prioriteit: number }[] = [
    { cx: start.cx, cz: start.cz, prioriteit: 0 },
  ];
  const gezien = new Set<number>();

  while (open_.length > 0 && gezien.size < MAX_BEZOCHT) {
    let beste = 0;
    for (let i = 1; i < open_.length; i++) {
      if (open_[i]!.prioriteit < open_[beste]!.prioriteit) beste = i;
    }
    const hier = open_.splice(beste, 1)[0]!;
    const hierSleutel = sleutel(hier.cx, hier.cz);
    if (gezien.has(hierSleutel)) continue;
    gezien.add(hierSleutel);

    if (hierSleutel === doelSleutel) {
      const cellen: RoutePunt[] = [];
      let loper: number | undefined = hierSleutel;
      while (loper !== undefined) {
        const cz = Math.floor(loper / CITY.gridSize);
        const cx = loper - cz * CITY.gridSize;
        cellen.unshift(cellToWorld(cx, cz));
        loper = vanwaar.get(loper);
      }
      // Begin- en eindpunt zijn waar je écht staat en waar je écht heen wil,
      // niet het middelpunt van de cel waarin dat toevallig valt.
      const punten = vereenvoudig([van, ...cellen, naar]);
      return { punten, lengte: lengteVan(punten), bereikbaar: true };
    }

    for (const stap of STAPPEN) {
      const bx = hier.cx + stap.dx;
      const bz = hier.cz + stap.dz;
      if (!open(bx, bz)) continue;
      const buurSleutel = sleutel(bx, bz);
      const nieuw =
        (kosten.get(hierSleutel) ?? 0) + (isRoadCell(bx, bz) ? KOSTEN_STRAAT : KOSTEN_OVERIG);
      if (nieuw >= (kosten.get(buurSleutel) ?? Number.POSITIVE_INFINITY)) continue;
      kosten.set(buurSleutel, nieuw);
      vanwaar.set(buurSleutel, hierSleutel);
      // Toelaatbaar: nooit duurder schatten dan de goedkoopste echte stap.
      const rest = (Math.abs(doel.cx - bx) + Math.abs(doel.cz - bz)) * KOSTEN_STRAAT;
      open_.push({ cx: bx, cz: bz, prioriteit: nieuw + rest });
    }
  }

  return rechtdoor;
}

/** Hoe ver een punt van de lijn af ligt; bepaalt of er opnieuw gerekend moet. */
export function afstandTotRoute(route: Route, punt: RoutePunt): number {
  let beste = Number.POSITIVE_INFINITY;
  for (let i = 1; i < route.punten.length; i++) {
    const a = route.punten[i - 1]!;
    const b = route.punten[i]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengte = dx * dx + dz * dz;
    const t = lengte === 0 ? 0 : Math.max(0, Math.min(1, ((punt.x - a.x) * dx + (punt.z - a.z) * dz) / lengte));
    beste = Math.min(beste, Math.hypot(punt.x - (a.x + dx * t), punt.z - (a.z + dz * t)));
  }
  return beste;
}
