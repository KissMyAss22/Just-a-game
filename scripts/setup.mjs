#!/usr/bin/env node
/**
 * Eenmalige voorbereiding om het spel op je eigen computer te draaien.
 *
 *   pnpm setup
 *
 * Controleert wat je nodig hebt, maakt de .env-bestanden aan en zoekt het
 * IP-adres op waarmee je telefoon je computer kan bereiken. Draait op macOS,
 * Windows en Linux, en is veilig om nog eens uit te voeren: bestaande
 * instellingen worden niet overschreven.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ok = (m) => console.log(`  [ok]   ${m}`);
const warn = (m) => console.log(`  [let op] ${m}`);
const fail = (m) => console.log(`  [FOUT] ${m}`);

let blocking = 0;

/**
 * Draait een commando en geeft de uitvoer terug, of null als het niet bestaat.
 *
 * Op Windows is `shell: true` geen luxe maar noodzaak: pnpm is daar een
 * `pnpm.cmd` en geen `.exe`, en execFileSync kan een .cmd niet rechtstreeks
 * starten. Zonder dit meldde het script "pnpm ontbreekt" terwijl pnpm er wel
 * degelijk stond - Docker werd wel gevonden, want dat is een echte .exe.
 *
 * De commando's hieronder zijn vaste waarden uit dit bestand, dus er komt
 * nooit invoer van buiten in de shell terecht.
 */
function run(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: process.platform === 'win32',
    }).trim();
  } catch {
    return null;
  }
}

console.log('\nJust a Game - voorbereiding\n');
console.log('1. Wat heb je geinstalleerd?');

const major = Number(process.versions.node.split('.')[0]);
if (major >= 20) {
  ok(`Node ${process.versions.node}`);
} else {
  fail(`Node ${process.versions.node} - je hebt versie 20 of hoger nodig (nodejs.org)`);
  blocking++;
}

const pnpmVersion = run('pnpm', ['--version']);
if (pnpmVersion) {
  ok(`pnpm ${pnpmVersion}`);
} else {
  fail('pnpm ontbreekt - installeer met: npm install -g pnpm');
  warn('net geinstalleerd? sluit dit venster en start het opnieuw');
  blocking++;
}

const dockerVersion = run('docker', ['--version']);
if (!dockerVersion) {
  fail('Docker ontbreekt - nodig voor de database (docker.com/products/docker-desktop)');
  blocking++;
} else if (run('docker', ['info']) === null) {
  fail('Docker is geinstalleerd maar draait niet - start Docker Desktop en probeer opnieuw');
  blocking++;
} else {
  ok(dockerVersion.replace('Docker version', 'Docker'));
}

// --- instellingen van de server ---------------------------------------------
console.log('\n2. Instellingen van de server');

const serverEnv = join(root, 'apps/server/.env');
if (existsSync(serverEnv)) {
  ok('apps/server/.env bestaat al - ongemoeid gelaten');
} else {
  const template = readFileSync(join(root, 'apps/server/.env.example'), 'utf8');
  const secret = randomBytes(32).toString('hex');
  writeFileSync(serverEnv, template.replace(/JWT_SECRET=".*"/, `JWT_SECRET="${secret}"`));
  ok('apps/server/.env aangemaakt, met een eigen willekeurige sleutel');
}

// --- adres waarop je telefoon de server vindt --------------------------------
console.log('\n3. Waar kan je telefoon de server vinden?');

/** Het adres van deze computer in je eigen wifi-netwerk. */
function lanAddress() {
  const candidates = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      // Alleen prive-adressen: dat is het netwerk waar je telefoon ook op zit.
      const isPrivate =
        address.address.startsWith('192.168.') ||
        address.address.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(address.address);
      if (!isPrivate) continue;
      // Wifi en ethernet gaan voor op virtuele adapters van Docker en VPN's.
      const virtual = /^(docker|br-|veth|vboxnet|vmnet|utun|tun|tap|zt)/i.test(name);
      candidates.push({ name, address: address.address, virtual });
    }
  }
  candidates.sort((a, b) => Number(a.virtual) - Number(b.virtual));
  return candidates[0] ?? null;
}

const lan = lanAddress();
const mobileEnv = join(root, 'apps/mobile/.env');
const existing = existsSync(mobileEnv) ? readFileSync(mobileEnv, 'utf8') : '';
const configured = existing.match(/^EXPO_PUBLIC_API_URL=(\S+)/m)?.[1];

if (configured) {
  ok(`apps/mobile/.env wijst al naar ${configured}`);
  if (lan && !configured.includes(lan.address)) {
    warn(`het adres van deze computer is nu ${lan.address} - klopt dat bestand nog?`);
  }
} else if (lan) {
  writeFileSync(mobileEnv, `EXPO_PUBLIC_API_URL=http://${lan.address}:4000\n`);
  ok(`apps/mobile/.env wijst nu naar http://${lan.address}:4000  (via ${lan.name})`);
} else {
  warn('geen netwerkadres gevonden - de app probeert het adres van Expo zelf te gebruiken');
  warn('werkt dat niet, zet dan zelf EXPO_PUBLIC_API_URL in apps/mobile/.env');
}

// --- volgende stappen --------------------------------------------------------
console.log('');
if (blocking > 0) {
  console.log(
    `Er ${blocking === 1 ? 'ontbreekt nog 1 ding' : `ontbreken nog ${blocking} dingen`}.`,
  );
  console.log('Los dat op en draai `pnpm setup` opnieuw.\n');
  process.exit(1);
}

console.log('Klaar. Nu in deze volgorde:\n');
console.log('  pnpm install        dependencies ophalen (eenmalig, duurt even)');
console.log('  pnpm db:up          database starten');
console.log('  pnpm db:migrate     tabellen aanmaken en de stad vullen met items');
console.log('  pnpm dev:server     de server starten - laat dit venster open staan');
console.log('');
console.log('  En in een tweede venster:');
console.log('  pnpm dev:mobile     scan de QR-code met Expo Go op je telefoon');
console.log('');
console.log('Je telefoon moet op hetzelfde wifi-netwerk zitten als deze computer.');
console.log('Loopt er iets vast? Zie docs/SPELEN.md\n');
