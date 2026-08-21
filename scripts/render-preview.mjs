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
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** Rendert één pagina naar een PNG. */
function shoot(page, file, width, height) {
  const target = join(outDir, file);
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
shoot('index.html', 'stad.png', 900, 4210);
shoot('items.html', 'items.png', 1100, 1060);
shoot('map.html', 'kaart.png', 660, 800);
shoot('home.html', 'woning.png', 820, 1220);
