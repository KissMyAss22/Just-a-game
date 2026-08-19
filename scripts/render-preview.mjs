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

const shot = join(outDir, 'stad.png');
rmSync(shot, { force: true });

console.log('Renderen...');
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
    `--screenshot=${shot}`,
    '--window-size=900,1500',
    `file://${join(previewDir, 'index.html')}`,
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);

if (!existsSync(shot)) {
  console.error('Er is geen plaatje gemaakt.');
  process.exit(1);
}
console.log(`Klaar: ${shot} (${(readFileSync(shot).length / 1024).toFixed(0)} kB)`);
