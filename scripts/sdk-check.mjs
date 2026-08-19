#!/usr/bin/env node
/**
 * Controleert of de geinstalleerde pakketten overeenkomen met wat het
 * project vraagt, en toont welke Expo-SDK er echt draait.
 *
 * Waarom dit bestaat: "ik heb gepulld" en "de nieuwe pakketten staan erop"
 * zijn twee verschillende dingen. Na een pull waarin de Expo-versie wijzigt,
 * blijft de oude SDK gewoon draaien tot er opnieuw geinstalleerd is. Expo Go
 * geeft dan "Project is incompatible with this version of Expo Go", wat naar
 * de telefoon lijkt te wijzen terwijl het probleem in node_modules zit.
 *
 * Exitcodes (START.bat leest deze):
 *   0  alles klopt
 *   2  geinstalleerde versies wijken af  -> opnieuw installeren nodig
 *   3  er is nog niets geinstalleerd
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Pakketten die stuk gaan als ze uit de pas lopen met de Expo-SDK. */
const BEWAAKT = ['expo', 'react-native', '@expo/metro-runtime', 'expo-router'];

function geinstalleerd(pakket) {
  // pnpm met node-linker=hoisted zet alles in de root; de app-map is de reserve.
  for (const basis of ['node_modules', 'apps/mobile/node_modules']) {
    const pad = join(root, basis, pakket, 'package.json');
    if (!existsSync(pad)) continue;
    try {
      return JSON.parse(readFileSync(pad, 'utf8')).version;
    } catch {
      return null;
    }
  }
  return null;
}

const app = JSON.parse(readFileSync(join(root, 'apps/mobile/package.json'), 'utf8'));
const gevraagd = (pakket) => app.dependencies?.[pakket] ?? null;

/**
 * Vergelijkt losjes: alleen het deel dat een breaking change aangeeft.
 * Bij 0.x-versies (react-native) is dat major.minor, anders de major.
 */
function reeks(versie) {
  const delen = String(versie).replace(/[^0-9.]/g, '').split('.');
  return delen[0] === '0' ? `${delen[0]}.${delen[1]}` : delen[0];
}

/** Leest de huidige commit uit .git, zonder git op het PATH nodig te hebben. */
function commit() {
  try {
    const head = readFileSync(join(root, '.git/HEAD'), 'utf8').trim();
    if (!head.startsWith('ref: ')) return head.slice(0, 7);
    const ref = head.slice(5).trim();
    const los = join(root, '.git', ref);
    if (existsSync(los)) return readFileSync(los, 'utf8').trim().slice(0, 7);
    const gebundeld = readFileSync(join(root, '.git/packed-refs'), 'utf8');
    const regel = gebundeld.split('\n').find((r) => r.endsWith(` ${ref}`));
    return regel ? regel.slice(0, 7) : 'onbekend';
  } catch {
    return 'onbekend';
  }
}

console.log(`  Projectversie: ${commit()}`);

const expo = geinstalleerd('expo');
if (!expo) {
  console.log('  De pakketten zijn nog niet opgehaald.');
  process.exit(3);
}

const sdk = expo.split('.')[0];
const wilSdk = reeks(gevraagd('expo'));

const scheef = [];
for (const pakket of BEWAAKT) {
  const wil = gevraagd(pakket);
  const heeft = geinstalleerd(pakket);
  if (!wil) continue;
  if (!heeft || reeks(heeft) !== reeks(wil)) {
    scheef.push({ pakket, wil, heeft: heeft ?? 'ontbreekt' });
  }
}

if (scheef.length === 0) {
  console.log(`  Expo SDK ${sdk} staat klaar. Je Expo Go moet SDK ${sdk} ondersteunen.`);
  process.exit(0);
}

console.log(`  Geinstalleerd: Expo SDK ${sdk}. Het project vraagt SDK ${wilSdk}.`);
console.log('');
for (const r of scheef) {
  console.log(`    ${r.pakket}: geinstalleerd ${r.heeft}, gevraagd ${r.wil}`);
}
process.exit(2);
