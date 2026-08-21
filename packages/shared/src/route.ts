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

/** Hoeveel cellen we hooguit bekijken. Een vangnet, geen werkgrens. */
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

const CELLEN = CITY.gridSize * CITY.gridSize;

function sleutel(cx: number, cz: number): number {
  return cz * CITY.gridSize + cx;
}

// ---------------------------------------------------------------------------
// Het begaanbare raster, één keer uitgerekend
//
// `isWalkable` per cel opvragen is niet gratis, en A* vraagt het voor elke
// buurcel opnieuw — een cel wordt vanuit vier kanten bekeken. Belangrijker nog:
// zonder te weten wélk aaneengesloten gebied een cel hoort, moet een route naar
// het privé-eiland eerst vierentwintigduizend cellen leeglopen voordat hij mag
// opgeven. Gemeten kostte dat 1,9 seconde, en de uitkomst stond van tevoren
// vast: er is geen weg naar een eiland.
//
// Eén tabel beantwoordt allebei die vragen. Per cel staat er het nummer van het
// aaneengesloten begaanbare gebied waarin hij ligt, of −1 als je er niet kunt
// staan. "Is deze cel open?" is dan `>= 0`, en "kan ik daar komen?" is
// "hebben start en doel hetzelfde nummer?".
// ---------------------------------------------------------------------------

let gebieden: Int32Array | null = null;

/**
 * Vier richtingen, en dat moet exact dezelfde verzameling zijn als `STAPPEN`
 * hieronder. Zou de vlekkenvuller diagonaal mogen en de zoeker niet, dan zegt
 * deze tabel "bereikbaar" over een plek waar A* nooit komt — en dan hangt hij
 * alsnog tot `MAX_BEZOCHT`.
 */
const STAPPEN = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
] as const;

function gebiedRaster(): Int32Array {
  if (gebieden) return gebieden;

  const raster = new Int32Array(CELLEN).fill(-2); // −2 = nog niet bekeken
  const grid = CITY.gridSize;

  for (let cz = 0; cz < grid; cz++) {
    for (let cx = 0; cx < grid; cx++) {
      if (isWaterCell(cx, cz)) {
        raster[sleutel(cx, cz)] = -1;
        continue;
      }
      const wereld = cellToWorld(cx, cz);
      if (!isWalkable(wereld.x, wereld.z, LOOPSTRAAL)) raster[sleutel(cx, cz)] = -1;
    }
  }

  // Vlekken vullen met een eigen stapel; recursie zou hier tienduizenden
  // niveaus diep gaan.
  const stapel = new Int32Array(CELLEN);
  let gebied = 0;
  for (let start = 0; start < CELLEN; start++) {
    if (raster[start] !== -2) continue;
    let top = 0;
    stapel[top++] = start;
    raster[start] = gebied;
    while (top > 0) {
      const index = stapel[--top]!;
      const cz = Math.floor(index / grid);
      const cx = index - cz * grid;
      for (const stap of STAPPEN) {
        const bx = cx + stap.dx;
        const bz = cz + stap.dz;
        if (bx < 0 || bz < 0 || bx >= grid || bz >= grid) continue;
        const buur = sleutel(bx, bz);
        if (raster[buur] !== -2) continue;
        raster[buur] = gebied;
        stapel[top++] = buur;
      }
    }
    gebied++;
  }

  gebieden = raster;
  return raster;
}

/** Is deze cel begaanbaar? Gemeten in het midden, zoals je er ook loopt. */
function open(cx: number, cz: number): boolean {
  if (cx < 0 || cz < 0 || cx >= CITY.gridSize || cz >= CITY.gridSize) return false;
  return gebiedRaster()[sleutel(cx, cz)]! >= 0;
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

// ---------------------------------------------------------------------------
// De wachtrij
//
// Hier stond een gewone array waarin elke stap lineair naar het laagste element
// zocht en het er met `splice` uithaalde. Het commentaar erbij zei dat een
// echte prioriteitswachtrij "meer code is dan hij oplevert, bij een paar
// honderd cellen". Dat klopte niet: gemeten zijn het er tienduizenden, en dan
// is lineair zoeken plus opschuiven kwadratisch. Een route dwars over de kaart
// kostte zo 654 milliseconden.
//
// Een binaire hoop is het hele verschil tussen A* en Dijkstra in de praktijk.
// ---------------------------------------------------------------------------

class Hoop {
  private cellen: number[] = [];
  private f: number[] = [];
  /** Bij gelijke f wint de cel die dichter bij het doel ligt. */
  private h: number[] = [];

  get size(): number {
    return this.cellen.length;
  }

  leeg(): void {
    this.cellen.length = 0;
    this.f.length = 0;
    this.h.length = 0;
  }

  private beter(a: number, b: number): boolean {
    if (this.f[a] !== this.f[b]) return this.f[a]! < this.f[b]!;
    return this.h[a]! < this.h[b]!;
  }

  private wissel(a: number, b: number): void {
    [this.cellen[a], this.cellen[b]] = [this.cellen[b]!, this.cellen[a]!];
    [this.f[a], this.f[b]] = [this.f[b]!, this.f[a]!];
    [this.h[a], this.h[b]] = [this.h[b]!, this.h[a]!];
  }

  push(cel: number, f: number, h: number): void {
    this.cellen.push(cel);
    this.f.push(f);
    this.h.push(h);
    let i = this.cellen.length - 1;
    while (i > 0) {
      const ouder = (i - 1) >> 1;
      if (!this.beter(i, ouder)) break;
      this.wissel(i, ouder);
      i = ouder;
    }
  }

  pop(): number {
    const top = this.cellen[0]!;
    const laatste = this.cellen.length - 1;
    this.wissel(0, laatste);
    this.cellen.pop();
    this.f.pop();
    this.h.pop();
    let i = 0;
    for (;;) {
      const links = i * 2 + 1;
      const rechts = links + 1;
      let beste = i;
      if (links < this.cellen.length && this.beter(links, beste)) beste = links;
      if (rechts < this.cellen.length && this.beter(rechts, beste)) beste = rechts;
      if (beste === i) break;
      this.wissel(i, beste);
      i = beste;
    }
    return top;
  }
}

// De werktabellen worden hergebruikt tussen aanroepen: ze zijn zo groot als de
// hele stad, en die elke keer opnieuw aanmaken en wegwerpen is precies het soort
// afval waar een telefoon van gaat haperen. `bezocht` draagt een stempel per
// zoektocht, zodat we ze niet hoeven leeg te maken.
const gKosten = new Float64Array(CELLEN);
const vanwaar = new Int32Array(CELLEN);
const bezocht = new Int32Array(CELLEN);
const gesloten = new Int32Array(CELLEN);
const hoop = new Hoop();
let stempel = 0;

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
 * De schatting is `manhattan × KOSTEN_STRAAT`. Strakker mág niet: een stap over
 * straat kost precies één, dus een route die helemaal over straat loopt kost
 * werkelijk zoveel. Elke hogere schatting zou een kortere route kunnen
 * wegstrepen. De winst zit dan ook niet in de schatting maar in de wachtrij en
 * in het niet zoeken naar wat onbereikbaar is.
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

  const raster = gebiedRaster();
  const startSleutel = sleutel(start.cx, start.cz);
  const doelSleutel = sleutel(doel.cx, doel.cz);

  // Liggen ze niet in hetzelfde aaneengesloten gebied, dan is er geen route en
  // heeft zoeken geen zin. Dit is het geval van het privé-eiland.
  if (raster[startSleutel] !== raster[doelSleutel]) return rechtdoor;

  const grid = CITY.gridSize;
  stempel++;
  hoop.leeg();
  gKosten[startSleutel] = 0;
  vanwaar[startSleutel] = -1;
  bezocht[startSleutel] = stempel;
  hoop.push(startSleutel, 0, 0);

  let gezien = 0;
  while (hoop.size > 0 && gezien < MAX_BEZOCHT) {
    const hierSleutel = hoop.pop();
    if (gesloten[hierSleutel] === stempel) continue;
    gesloten[hierSleutel] = stempel;
    gezien++;

    if (hierSleutel === doelSleutel) {
      const cellen: RoutePunt[] = [];
      let loper = hierSleutel;
      while (loper !== -1) {
        const cz = Math.floor(loper / grid);
        const cx = loper - cz * grid;
        cellen.unshift(cellToWorld(cx, cz));
        loper = vanwaar[loper]!;
      }
      // Begin- en eindpunt zijn waar je écht staat en waar je écht heen wil,
      // niet het middelpunt van de cel waarin dat toevallig valt.
      const punten = vereenvoudig([van, ...cellen, naar]);
      return { punten, lengte: lengteVan(punten), bereikbaar: true };
    }

    const cz = Math.floor(hierSleutel / grid);
    const cx = hierSleutel - cz * grid;
    const hierKosten = gKosten[hierSleutel]!;

    for (const stap of STAPPEN) {
      const bx = cx + stap.dx;
      const bz = cz + stap.dz;
      if (bx < 0 || bz < 0 || bx >= grid || bz >= grid) continue;
      const buurSleutel = sleutel(bx, bz);
      if (raster[buurSleutel]! < 0) continue;
      if (gesloten[buurSleutel] === stempel) continue;

      const nieuw = hierKosten + (isRoadCell(bx, bz) ? KOSTEN_STRAAT : KOSTEN_OVERIG);
      if (bezocht[buurSleutel] === stempel && nieuw >= gKosten[buurSleutel]!) continue;

      bezocht[buurSleutel] = stempel;
      gKosten[buurSleutel] = nieuw;
      vanwaar[buurSleutel] = hierSleutel;
      // Toelaatbaar: nooit duurder schatten dan de goedkoopste echte stap.
      const rest = (Math.abs(doel.cx - bx) + Math.abs(doel.cz - bz)) * KOSTEN_STRAAT;
      hoop.push(buurSleutel, nieuw + rest, rest);
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
