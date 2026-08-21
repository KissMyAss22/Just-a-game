/**
 * Bouwt dezelfde stad als de app, maar dan in een gewone browser.
 *
 * Waarom dit bestaat: de gevels, het wegdek en het water zijn shaders. Een
 * typefout daarin merk je niet bij het typechecken en niet in een unittest —
 * pas op de telefoon, als zwart scherm. Met deze scene draait exact dezelfde
 * code in een echte WebGL-context, zodat een fout hier al opvalt.
 *
 * De vier beelden staan op verschillende uren, zodat ook de dag- en
 * nachtcyclus te beoordelen is zonder tot vanavond te wachten.
 */
import {
  cellToWorld,
  getVehicle,
  homeAddress,
  isParkSide,
  parkPropsIn,
  parkRect,
  findRoute,
  shopSpots,
  spawnPosition,
  specialArea,
  specialAreaCenter,
  streetPropsIn,
  worldToCell,
  type StreetProp,
} from '@game/shared';
import * as THREE from 'three';
import { createCharacter } from '../../apps/mobile/src/game3d/city/character';
import { createCrowd } from '../../apps/mobile/src/game3d/city/crowd';
import { ingestSnapshot } from '../../apps/mobile/src/net/presence';
import { createLootField } from '../../apps/mobile/src/game3d/city/loot';
import { QUALITY } from '../../apps/mobile/src/game3d/city/quality';
import { createVehicle } from '../../apps/mobile/src/game3d/city/vehicle';
import { createDoorways } from '../../apps/mobile/src/game3d/city/doorway';
import { createShopfronts } from '../../apps/mobile/src/game3d/city/shopfront';
import { createWorld } from '../../apps/mobile/src/game3d/city/world';
import { buildRoute } from '../../apps/mobile/src/game3d/city/route';

declare global {
  interface Window {
    __preview?: { errors: string[]; info: string };
  }
}

const errors: string[] = [];
window.__preview = { errors, info: '' };

// three meldt shaderfouten via console.error; die willen we in het plaatje.
const nativeError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const text = args.map((a) => String(a)).join(' ');
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  errors.push(lines.slice(0, 6).join(' // ').slice(0, 600));
  nativeError(...args);
};

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(canvas.width, canvas.height, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// De melding van three is summier; deze haak geeft de echte regel uit de
// GLSL-compiler, inclusief regelnummer.
renderer.debug.onShaderError = (gl, _program, _vertex, fragment) => {
  const log = (gl.getShaderInfoLog(fragment) ?? '').replace(/[^\x20-\x7e\n]/g, '');
  errors.push(`GLSL: ${log.split('\n').slice(0, 4).join(' | ')}`);
};

const scene = new THREE.Scene();
const settings = QUALITY.hoog;
const camera = new THREE.PerspectiveCamera(52, 1, 0.4, settings.far);

const start = spawnPosition();
const player = { x: start.x + 6, z: start.z + 6 };

// Precies de wereld die de app ook opbouwt, met een klok die wij bepalen.
let hour = 13;
const world = createWorld(renderer, scene, 'hoog', () => hour);
scene.add(world.root);

// De renderproef stond alleen in de Oude Stad. Andere wijken hebben een ander
// palet en een andere gevelsoort, en die waren dus nooit bekeken.
const extraSpots: [number, number][] = [[-348, 124]];

const character = createCharacter({ skin: '#c89066', outfit: '#2f6f5e', accent: '#e0b64a' });
character.group.position.set(player.x, 0, player.z);
character.group.rotation.y = Math.PI * 0.05;
character.update(0.016, 3.2, player.x, player.z);
scene.add(character.group);

// Twee voertuigen op de rijbaan: de auto en de scooter delen dezelfde opbouw
// maar zien er heel anders uit, dus allebei even bekijken.
const sedan = createVehicle(getVehicle('sedan'), '#8e1f23');
sedan.place(4, 16, 0);
sedan.update(0.016, 12, 0.35, true, 0);
scene.add(sedan.group);

const scooter = createVehicle(getVehicle('scooter'), '#2f6f5e');
scooter.place(4, 5, 0.2);
scooter.update(0.016, 4, -0.2, false, 0);
scene.add(scooter.group);

// Twee nepspelers in de gedeelde wereld, zodat ook die code hier draait: één
// die loopt en één die rijdt. De renderproef praat niet met de server; hij zet
// de momentopname er rechtstreeks in.
const crowd = createCrowd(true);
scene.add(crowd.group);
ingestSnapshot({
  t: 'snapshot',
  at: Date.now(),
  players: [
    { id: 'p1', n: 'Sanne', x: player.x - 4.5, z: player.z + 6, h: 2.6, d: 0, v: 'on_foot', level: 12, s: 2, o: 3, a: 1 },
    { id: 'p2', n: 'Joost', x: 4, z: player.z + 26, h: 0, d: 1, v: 'hatchback', level: 27, s: 0, o: 1, a: 4 },
  ],
});

// De pandjeshuizen. Hun plek wordt gezocht, dus die moet je zien: staat er
// eentje in een muur of half op de rijbaan, dan is dat hier meteen duidelijk.
const shops = createShopfronts(true);
shops.update(0.016);
scene.add(shops.group);

// Voordeuren: één waar je woont, één met een Te Koop-bord ernaast. Of dat op
// de stoep past en niet in de gevel verdwijnt zie je alleen door te kijken.
const woonadres = homeAddress('squat', 12345)!;
const koopadres = homeAddress('studio', 12345)!;
const doorways = createDoorways(
  [
    { address: woonadres, owned: true },
    { address: koopadres, owned: false },
  ],
  true,
);
scene.add(doorways.group);

const loot = createLootField((rarity) =>
  rarity === 'legendary' ? '#fbbf24' : rarity === 'rare' ? '#38bdf8' : '#4ade80',
);
loot.update(
  [
    { id: 'a', itemId: 'x', rarity: 'rare', x: player.x + 3.5, z: player.z + 1.5, expiresAt: 0 },
    { id: 'b', itemId: 'y', rarity: 'legendary', x: player.x - 2.5, z: player.z + 4.5, expiresAt: 0 },
    { id: 'c', itemId: 'z', rarity: 'common', x: player.x + 7.0, z: player.z - 3.0, expiresAt: 0 },
  ] as never,
  player.x,
  player.z,
  4.2,
  2.2,
);
scene.add(loot.group);

/**
 * Waar het parkbeeld komt te staan, en wat er in het park hoort te staan.
 *
 * De vorige ronde leverde een parkbeeld op dat vooral nevel was: je keek over
 * driehonderd meter open terrein met de mistgrens op vijfhonderd. Zo'n beeld
 * zegt niets. De camera gaat daarom op ooghoogte op een pad staan — dát is wat
 * een speler ziet — en de telling gaat in de overlay, zodat een regressie in
 * het plaatje zelf staat in plaats van dat hij opnieuw opgemeten moet worden.
 */
const parkVak = parkRect();
const parkProps = parkPropsIn(parkVak.minX, parkVak.minZ, parkVak.maxX, parkVak.maxZ);
const parkHart = cellToWorld(144, 64);

function dichtstbij(kind: StreetProp['kind'], x: number, z: number): StreetProp | undefined {
  let best: StreetProp | undefined;
  let bestAfstand = Infinity;
  for (const prop of parkProps) {
    if (prop.kind !== kind) continue;
    const afstand = (prop.x - x) ** 2 + (prop.z - z) ** 2;
    if (afstand < bestAfstand) {
      bestAfstand = afstand;
      best = prop;
    }
  }
  return best;
}

const parkBank = dichtstbij('parkBench', parkHart.x, parkHart.z);
const parkPad = parkBank ? dichtstbij('parkPath', parkBank.x, parkBank.z) : undefined;
// De lange kant van een plaat pad ligt op de z-as, dus dit is de looprichting.
const padRichting = parkPad
  ? { x: Math.sin(parkPad.rotY), z: Math.cos(parkPad.rotY) }
  : { x: 0, z: 1 };

/** Wat er ondanks alles nog aan stráátmeubilair in het park staat. Hoort 0 te zijn. */
const straatvuilInHetPark = streetPropsIn(
  parkVak.minX - 60,
  parkVak.minZ - 60,
  parkVak.maxX + 60,
  parkVak.maxZ + 60,
).filter((prop) => {
  const cell = worldToCell(prop.x, prop.z);
  return isParkSide(cell.cx, cell.cz);
});

function telling(props: StreetProp[]): string {
  const perSoort = new Map<string, number>();
  for (const prop of props) perSoort.set(prop.kind, (perSoort.get(prop.kind) ?? 0) + 1);
  if (perSoort.size === 0) return 'niets';
  return [...perSoort].map(([kind, aantal]) => `${kind} ${aantal}`).join(' ');
}

/**
 * De navigatielijn, zoals hij op straat voor je ligt.
 *
 * Of een lijn te volgen is zie je niet aan een test: die zegt alleen dat elke
 * stap begaanbaar is. Of hij leesbaar over het wegdek loopt en niet in de
 * belijning verdwijnt, zie je alleen door ervoor te gaan staan.
 */
const parkMidden = specialAreaCenter(specialArea('stadspark'));
const pleinMidden = specialAreaCenter(specialArea('plein'));

const routeStart = spawnPosition();
const routeDoel = shopSpots()[0];
const proefRoute = routeDoel
  ? findRoute(routeStart, { x: routeDoel.x, z: routeDoel.z })
  : null;
const routeLint = proefRoute ? buildRoute(proefRoute) : null;
if (routeLint) scene.add(routeLint.mesh);

interface View {
  name: string;
  hour: number;
  height: number;
  place: (c: THREE.PerspectiveCamera) => void;
  /**
   * Waar de wereld omheen geladen moet worden. De stad laadt in chunks rond
   * de speler; kijk je ergens anders, dan moet hij dat weten. Zonder dit stond
   * er letterlijk niets in beeld.
   */
  focus?: [number, number];
  /** Beeldhoek; standaard dezelfde als in de app. */
  fov?: number;
}

const views: View[] = [
  {
    name: 'gevel van dichtbij',
    hour: 11,
    height: 460,
    place: (c) => {
      c.position.set(14.0, 4.0, 30.0);
      c.lookAt(30.0, 6.0, 46.0);
    },
  },
  {
    name: 'middag',
    hour: 13,
    height: 380,
    place: (c) => {
      c.position.set(player.x + 60, 70, player.z + 80);
      c.lookAt(player.x, 0, player.z);
    },
  },
  {
    name: 'industrieterrein in de ochtend',
    hour: 8.3,
    height: 330,
    focus: extraSpots[0],
    place: (c) => {
      c.position.set(-348, 4.5, 118);
      c.lookAt(-348, 2.0, 160);
    },
  },
  {
    name: 'nacht',
    hour: 23,
    height: 330,
    place: (c) => {
      c.position.set(player.x + 9, 4.5, player.z + 12);
      c.lookAt(player.x, 1.6, player.z);
    },
  },
  {
    // Vanaf de rijbaan langs de stoeprand kijken.
    //
    // De straat-as ligt hier op x=52 (de assen liggen op 12 + 40k), het asfalt
    // loopt van 49 tot 55 en de westelijke stoep van 47,4 tot 49,0. Op precies
    // 48,2 staat een rij meubels: brandkranen op z=21,6 en z=-2,4 en een
    // prullenbak op z=-22,4. De camera staat op het asfalt en kijkt er langs.
    //
    // Dit beeld bestaat omdat het misging: de prullenbak werd in de
    // kijkrichting van de lantaarn gezet en die buigt naar de weg toe, dus
    // stond hij op de rijbaan. Op een overzichtsbeeld zie je dat niet.
    name: 'pandjeshuis',
    hour: 14,
    height: 380,
    fov: 40,
    focus: [shopSpots()[0]!.x, shopSpots()[0]!.z],
    place: (c) => {
      const shop = shopSpots()[0]!;
      // Schuin van voren, vanaf de straatkant: zo zie je de luifel, het bord
      // en of de verkoper op de stoep staat in plaats van op de rijbaan.
      c.position.set(
        shop.x + Math.sin(shop.rotY) * 6.5 + 2.4,
        2.6,
        shop.z + Math.cos(shop.rotY) * 6.5 + 1.2,
      );
      c.lookAt(shop.x, 1.5, shop.z);
    },
  },
  {
    // Het park op ooghoogte, op een pad, met een bank in beeld. Dit is de enige
    // stand waarop te beoordelen is of het als een park voelt: van bovenaf zie
    // je vooral de mist, en die zegt alleen iets over de zichtafstand.
    name: 'op een pad in het park',
    hour: 15,
    height: 380,
    focus: [parkPad?.x ?? parkHart.x, parkPad?.z ?? parkHart.z],
    place: (c) => {
      const staan = parkPad ?? { x: parkHart.x, z: parkHart.z };
      c.position.set(staan.x - padRichting.x * 7, 1.7, staan.z - padRichting.z * 7);
      c.lookAt(staan.x + padRichting.x * 16, 1.2, staan.z + padRichting.z * 16);
    },
  },
  {
    // En van iets hoger, maar steil genoeg naar beneden dat de horizon buiten
    // beeld valt: gras in plaats van asfalt, bomen, ruïnes en de slinger van
    // de paden erdoorheen.
    name: 'het verlaten park van boven',
    hour: 15,
    height: 380,
    focus: [parkHart.x, parkHart.z],
    place: (c) => {
      c.position.set(parkHart.x - 24, 30, parkHart.z + 28);
      c.lookAt(parkHart.x + 4, 0, parkHart.z);
    },
  },
  {
    // De landtong: de enige doorgang, met water aan weerszijden.
    name: 'de landtong naar het park',
    hour: 15,
    height: 380,
    focus: [cellToWorld(130, 62).x, cellToWorld(130, 62).z],
    place: (c) => {
      const brug = cellToWorld(130, 62);
      c.position.set(brug.x - 34, 14, brug.z + 20);
      c.lookAt(brug.x + 24, 0, brug.z - 4);
    },
  },
  {
    // Het stadspark: gras midden tussen de bouwblokken, met de straten eromheen.
    name: 'het stadspark',
    hour: 13,
    height: 380,
    focus: [parkMidden.x, parkMidden.z],
    place: (c) => {
      c.position.set(parkMidden.x - 62, 26, parkMidden.z + 62);
      c.lookAt(parkMidden.x, 0, parkMidden.z);
    },
  },
  {
    // Het marktplein met de kramen: één winkel en drie plekken die wachten.
    name: 'het marktplein',
    hour: 13,
    height: 380,
    focus: [pleinMidden.x, pleinMidden.z],
    place: (c) => {
      c.position.set(pleinMidden.x, 4.6, pleinMidden.z + 26);
      c.lookAt(pleinMidden.x, 1.2, pleinMidden.z + 10);
    },
  },
  {
    // Op de lijn staan, kijkend naar waar hij heen gaat.
    name: 'de route naar het pandjeshuis',
    hour: 13,
    height: 380,
    focus: [routeStart.x, routeStart.z],
    place: (c) => {
      // Het eerste punt dat ver genoeg weg ligt om een richting uit te halen.
      // Op het punt waar je staat zelf mikken geeft een camera die naar
      // zichzelf kijkt, en dan rendert er van alles behalve wat je wil zien.
      const naar =
        proefRoute?.punten.find(
          (punt) => Math.hypot(punt.x - routeStart.x, punt.z - routeStart.z) > 8,
        ) ?? routeStart;
      const dx = naar.x - routeStart.x;
      const dz = naar.z - routeStart.z;
      const lengte = Math.hypot(dx, dz) || 1;
      c.position.set(routeStart.x - (dx / lengte) * 7, 2.2, routeStart.z - (dz / lengte) * 7);
      c.lookAt(naar.x, 0.3, naar.z);
    },
  },
  {
    name: 'je eigen voordeur',
    hour: 13,
    height: 380,
    fov: 40,
    focus: [woonadres.x, woonadres.z],
    place: (c) => {
      // Schuin van voren vanaf de straat, zoals je er zelf op af loopt.
      c.position.set(
        woonadres.x + Math.sin(woonadres.rotY) * 6 + 2,
        2.4,
        woonadres.z + Math.cos(woonadres.rotY) * 6 + 1,
      );
      c.lookAt(woonadres.x, 1.4, woonadres.z);
    },
  },
  {
    name: 'te koop',
    hour: 13,
    height: 380,
    fov: 40,
    focus: [koopadres.x, koopadres.z],
    place: (c) => {
      c.position.set(
        koopadres.x + Math.sin(koopadres.rotY) * 8 + 3.5,
        2.8,
        koopadres.z + Math.cos(koopadres.rotY) * 8 + 2.2,
      );
      c.lookAt(koopadres.x + 0.5, 1.3, koopadres.z);
    },
  },
  {
    // Elk ander beeld staat op ooghoogte tussen de gevels, en daar zie je van de
    // lucht alleen een streep vlak boven de horizon — precies waar de nevel het
    // overneemt. Het verloop, de zon en de wolken uit `sky.ts` waren dus nergens
    // te beoordelen. Dit beeld kijkt omhoog vanaf het plein.
    name: 'de lucht vanaf het plein',
    hour: 13,
    height: 420,
    focus: [pleinMidden.x, pleinMidden.z],
    place: (c) => {
      c.position.set(pleinMidden.x, 2.0, pleinMidden.z);
      c.lookAt(pleinMidden.x + 26, 34, pleinMidden.z + 14);
    },
    fov: 68,
  },
  {
    name: 'stoeprand van opzij',
    hour: 15,
    height: 380,
    focus: [50, 16],
    fov: 32,
    place: (c) => {
      c.position.set(53.2, 2.8, 40);
      c.lookAt(48.6, 0.6, 2);
    },
  },
];


renderer.setScissorTest(true);
/**
 * De hoogte van het canvas staat op drie plekken: hier, in `index.html` en in
 * het screenshot-commando van `render-preview.mjs`. Dat kan niet anders — de
 * vensterhoogte moet vaststaan voordat de pagina draait — maar het mag wel
 * opvallen als het uit elkaar loopt. Klopte het niet, dan verdween er stilletjes
 * een beeld onderaan, en dat merk je pas als je het mist.
 */
const benodigdeHoogte = views.reduce((som, view) => som + view.height, 0);
if (canvas.height < benodigdeHoogte) {
  errors.push(
    `canvas is ${canvas.height} hoog maar de beelden vragen ${benodigdeHoogte};` +
      ' pas index.html en render-preview.mjs aan',
  );
}

let offset = canvas.height;
for (const view of views) {
  offset -= view.height;
  hour = view.hour;
  camera.aspect = canvas.width / view.height;
  camera.fov = view.fov ?? 52;
  camera.updateProjectionMatrix();
  view.place(camera);
  const focus = view.focus ?? [player.x, player.z];
  world.update(camera, 12, focus[0]!, focus[1]!);
  crowd.update(camera, canvas.width, view.height, 0.016, hour > 19 || hour < 6 ? 1 : 0);
  renderer.setViewport(0, offset, canvas.width, view.height);
  renderer.setScissor(0, offset, canvas.width, view.height);
  try {
    renderer.render(scene, camera);
  } catch (error) {
    errors.push(`${view.name}: ${String(error)}`);
  }
}

const gl = renderer.getContext();
let glError = gl.getError();
while (glError !== gl.NO_ERROR) {
  errors.push(`WebGL-fout 0x${glError.toString(16)}`);
  glError = gl.getError();
}

const overlay = document.getElementById('overlay');
if (overlay) {
  overlay.textContent = [
    `tekenopdrachten ${renderer.info.render.calls} | driehoeken ${renderer.info.render.triangles}` +
      ` | programmas ${renderer.info.programs?.length ?? 0}`,
    // Zonder deze regel weet je niet of je naar hetzelfde beeld kijkt als een
    // telefoon. Lukt de omgevingstextuur niet, dan spiegelt geen enkel raam en
    // wordt het hemellicht 2,6 keer opgeschroefd — een merkbaar vlakkere stad.
    `omgevingstextuur: ${world.heeftOmgeving ? 'ja' : 'NEE — dit beeld is vlakker dan op een toestel dat het wel kan'}` +
      ` | anisotropie max ${renderer.capabilities.getMaxAnisotropy()}` +
      ` | ${renderer.capabilities.isWebGL2 === false ? 'WebGL1' : 'WebGL2'}`,
    `uren van boven naar beneden: ${views.map((v) => `${v.name} ${v.hour}`).join(' / ')}`,
    `naambordjes: ${crowd.plates.map((p) => `${p.name} lvl${p.level} @${Math.round(p.x)},${Math.round(p.y)}`).join(' | ')}`,
    `park: ${telling(parkProps)} | straatmeubilair in het park: ${telling(straatvuilInHetPark)}`,
    errors.length ? `FOUTEN: ${errors.join(' | ')}` : 'geen fouten',
  ].join('\n');
}

window.__preview.info = JSON.stringify({ calls: renderer.info.render.calls, errors: errors.length });
document.title = errors.length ? `FOUT: ${errors[0]}` : 'ok';
