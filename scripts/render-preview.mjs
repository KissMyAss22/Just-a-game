#!/usr/bin/env node
/**
 * Rendert de stad in een echte WebGL-context en maakt er een plaatje van.
 *
 * Shaders vallen niet om bij het typechecken; ze vallen om op het toestel.
 * Deze stap draait dezelfde materialen en dezelfde chunkopbouw in een headless
 * Chromium, meldt compilatiefouten en zet het resultaat in een PNG, zodat een
 * visuele wijziging te controleren is zonder telefoon.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Via tsx, zodat het stempel van de kaart uit dezelfde constanten komt als de
// kaart zelf in plaats van hier nog eens ingetypt te worden.
import { kaartStempel } from '../packages/shared/src/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const previewDir = join(root, 'scripts/preview');
const outDir = process.argv[2] ?? join(root, '.preview');

const CHROME_CANDIDATES = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
];

const chrome = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!chrome) {
  console.error('Geen Chromium gevonden; sla de renderproef over.');
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
const bundle = join(previewDir, 'bundle.js');

/**
 * Een backtick in shadercommentaar sluit de template-string voortijdig af.
 *
 * Dat is twee keer gebeurd, en allebei de keren was de melding een esbuild-fout
 * over een haakje op een regel die er niets mee te maken had. Deze controle
 * kost niets en zegt meteen wat er aan de hand is.
 */
function controleerShaders() {
  const bestanden = [
    'apps/mobile/src/game3d/city/materials.ts',
    'apps/mobile/src/game3d/city/sky.ts',
  ];
  for (const pad of bestanden) {
    const bron = readFileSync(join(root, pad), 'utf8');
    let vanaf = 0;
    for (;;) {
      const begin = bron.indexOf('/* glsl */', vanaf);
      if (begin < 0) break;
      const open = bron.indexOf('`', begin);
      const dicht = bron.indexOf('`', open + 1);
      const blok = bron.slice(open + 1, dicht);
      const regel = bron.slice(0, open).split('\n').length;
      if (blok.includes('`')) {
        console.error(
          `Backtick in het shaderblok van ${pad} rond regel ${regel}.\n` +
            'Een backtick sluit de template-string af; gebruik aanhalingstekens in commentaar.',
        );
        process.exit(1);
      }
      vanaf = dicht + 1;
    }
  }
}
controleerShaders();

console.log('Bundelen...');
execFileSync(
  join(root, 'node_modules/.bin/esbuild'),
  [
    join(previewDir, 'scene.ts'),
    '--bundle',
    '--format=iife',
    '--platform=browser',
    '--loader:.ts=ts',
    // De workspace-link staat niet in de root-node_modules; esbuild vindt hem
    // alleen als we hem expliciet aanwijzen.
    '--alias:@game/shared=./packages/shared/src/index.ts',
    `--outfile=${bundle}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit', cwd: root },
);

/** De itemmodellen krijgen hun eigen pagina; die wil je los kunnen bekijken. */
console.log('Bundelen (items)...');
execFileSync(
  join(root, 'node_modules/.bin/esbuild'),
  [
    join(previewDir, 'items.ts'),
    '--bundle',
    '--format=iife',
    '--platform=browser',
    '--loader:.ts=ts',
    '--alias:@game/shared=./packages/shared/src/index.ts',
    `--outfile=${join(previewDir, 'items-bundle.js')}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit', cwd: root },
);

/** De kaart uit de telefoon: gewone rechthoeken, dus geen WebGL nodig. */
console.log('Bundelen (kaart)...');
execFileSync(
  join(root, 'node_modules/.bin/esbuild'),
  [
    join(previewDir, 'map.ts'),
    '--bundle',
    '--format=iife',
    '--platform=browser',
    '--loader:.ts=ts',
    '--alias:@game/shared=./packages/shared/src/index.ts',
    `--outfile=${join(previewDir, 'map-bundle.js')}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit', cwd: root },
);

/**
 * De stadsplattegrond die de app als afbeelding meekrijgt.
 *
 * Dit is geen proefbeeld maar een bouwproduct: het resultaat gaat naar
 * apps/mobile/assets en wordt meegeleverd met de app.
 */
console.log('Bundelen (stadskaart)...');
execFileSync(
  join(root, 'node_modules/.bin/esbuild'),
  [
    join(previewDir, 'citymap.ts'),
    '--bundle',
    '--format=iife',
    '--platform=browser',
    '--loader:.ts=ts',
    '--alias:@game/shared=./packages/shared/src/index.ts',
    `--outfile=${join(previewDir, 'citymap-bundle.js')}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit', cwd: root },
);

/** Je woning van binnen: sinds je er doorheen loopt moet je erin kunnen kijken. */
console.log('Bundelen (woning)...');
execFileSync(
  join(root, 'node_modules/.bin/esbuild'),
  [
    join(previewDir, 'home.ts'),
    '--bundle',
    '--format=iife',
    '--platform=browser',
    '--loader:.ts=ts',
    '--alias:@game/shared=./packages/shared/src/index.ts',
    `--outfile=${join(previewDir, 'home-bundle.js')}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit', cwd: root },
);

/**
 * Hoeveel pixels er op een wereldmeter gaan. Moet gelijk zijn aan `PER_METER`
 * in `scripts/preview/citymap.ts` — dat is het enige getal dat hier nog naast
 * staat, en het bepaalt hoe groot de plaat wordt.
 */
const KAART_PER_METER = 1.6;

/** Rendert één pagina naar een PNG. */
function shoot(page, file, width, height) {
  const target = join(outDir, file);
  shootTo(page, target, width, height);
}

/** Zelfde, maar naar een pad dat je zelf kiest. */
function shootTo(page, target, width, height) {
  rmSync(target, { force: true });
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--hide-scrollbars',
      '--no-sandbox',
      '--virtual-time-budget=8000',
      `--screenshot=${target}`,
      `--window-size=${width},${height}`,
      `file://${join(previewDir, page)}`,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  if (!existsSync(target)) {
    console.error(`Er is geen plaatje gemaakt voor ${page}.`);
    process.exit(1);
  }
  console.log(`Klaar: ${target} (${(readFileSync(target).length / 1024).toFixed(0)} kB)`);
}

console.log('Renderen...');
shoot('index.html', 'stad.png', 900, 6180);
shoot('items.html', 'items.png', 1100, 1060);
shoot('map.html', 'kaart.png', 660, 800);
shoot('home.html', 'woning.png', 820, 1220);

/**
 * De stadskaart gaat niet naar .preview maar naar de app zelf.
 *
 * Het stempel ernaast legt vast bij wélke stad deze plaat hoort; een test
 * vergelijkt dat met CITY. Zonder die bewaking loop je een halfjaar met een
 * kaart van een stad die niet meer bestaat, en dat is precies het risico dat je
 * neemt als je iets vooraf tekent.
 */
console.log('Stadskaart tekenen...');
const kaartMap = join(root, 'apps/mobile/assets');
mkdirSync(kaartMap, { recursive: true });
const stempel = kaartStempel(KAART_PER_METER);
const kaartMaat = stempel.size;
shootTo('citymap.html', join(kaartMap, 'stadskaart.png'), kaartMaat, kaartMaat);
writeFileSync(
  join(kaartMap, 'stadskaart.json'),
  `${JSON.stringify(stempel, null, 2)}\n`,
);
console.log(`Klaar: ${join(kaartMap, 'stadskaart.png')} (${kaartMaat}x${kaartMaat})`);
