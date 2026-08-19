#!/usr/bin/env node
/**
 * Laat zien welke Expo-SDK er daadwerkelijk geinstalleerd is.
 *
 * Nodig omdat "ik heb gepulld" en "de nieuwe pakketten staan erop" twee
 * verschillende dingen zijn: na een pull met andere versies moet er opnieuw
 * geinstalleerd worden, anders draait de oude SDK gewoon door.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function versieVan(pakket) {
  const pad = join(root, 'node_modules', pakket, 'package.json');
  if (!existsSync(pad)) return null;
  try {
    return JSON.parse(readFileSync(pad, 'utf8')).version;
  } catch {
    return null;
  }
}

function gevraagd(pakket) {
  const pad = join(root, 'apps/mobile/package.json');
  const d = JSON.parse(readFileSync(pad, 'utf8'));
  return d.dependencies?.[pakket] ?? null;
}

console.log('\nWelke versies draaien er nu?\n');

const expo = versieVan('expo');
const rn = versieVan('react-native');

if (!expo) {
  console.log('  De pakketten zijn nog niet geinstalleerd.');
  console.log('  Dubbelklik eerst op INSTALLEER.bat\n');
  process.exit(1);
}

const sdk = expo.split('.')[0];
console.log(`  Expo SDK          ${sdk}          (expo ${expo})`);
console.log(`  React Native      ${rn}`);
console.log(`  In package.json   ${gevraagd('expo')}`);

const gewenstSdk = (gevraagd('expo') ?? '').replace(/[^0-9.]/g, '').split('.')[0];
console.log('');
if (gewenstSdk && gewenstSdk !== sdk) {
  console.log(`  LET OP: package.json wil SDK ${gewenstSdk}, maar SDK ${sdk} staat geinstalleerd.`);
  console.log('  Draai INSTALLEER.bat opnieuw, anders blijft de oude versie draaien.\n');
} else {
  console.log(`  Je telefoon heeft een Expo Go nodig die SDK ${sdk} ondersteunt.`);
  console.log('  Klopt dat niet, geef dan door welke versie je Expo Go is.\n');
}
