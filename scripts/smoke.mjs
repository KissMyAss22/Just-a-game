#!/usr/bin/env node
/**
 * Loopt in één keer de weg af die een speler bij het opstarten aflegt.
 *
 * Waarom dit bestaat: de unittests dekken de wereld en de economie, maar niets
 * dekte de kéten — lege database, migraties, server omhoog, en de app die zijn
 * eerste toestand ophaalt. Precies daar ging het mis toen er een tabel bijkwam:
 * elke test stond groen en de app gaf "Er ging iets mis op de server."
 *
 * Gebruik: start je server (`pnpm dev:server`) en draai dan `pnpm smoke`.
 * Wil je ook het parkdeel toetsen, start de server dan met DEV_TOOLS=1.
 */

const API = process.env.SMOKE_API ?? 'http://127.0.0.1:4000';

let stap = 0;
const meldingen = [];

function ok(wat, detail = '') {
  stap += 1;
  meldingen.push(`  ${String(stap).padStart(2)}. ✓ ${wat}${detail ? ` — ${detail}` : ''}`);
}

function faal(wat, detail) {
  console.log(meldingen.join('\n'));
  console.error(`\n  ✗ ${wat}`);
  if (detail) console.error(`    ${detail}`);
  process.exit(1);
}

async function vraag(pad, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${pad}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const tekst = await res.text();
  let data;
  try {
    data = JSON.parse(tekst);
  } catch {
    faal(`${method} ${pad} gaf geen JSON terug`, tekst.slice(0, 200));
  }
  if (!res.ok) faal(`${method} ${pad} gaf ${res.status}`, tekst.slice(0, 300));
  return data;
}

console.log(`Proefrit tegen ${API}\n`);

// 1. Staat de server überhaupt op?
let gezond;
try {
  gezond = await vraag('/health');
} catch (error) {
  faal(
    'De server is niet bereikbaar',
    `${String(error)}\n    Draait hij? Start hem met: pnpm dev:server`,
  );
}
if (gezond.ok !== true) faal('/health zegt niet ok', JSON.stringify(gezond));
ok(
  'server bereikbaar',
  `versie ${gezond.version ?? 'onbekend'}, gestart ${gezond.startedAt ?? 'onbekend'}`,
);

// 2. Een verse speler. Een eigen toestel-id per rit, zodat een tweede rit geen
//    halve toestand van de vorige erft.
const deviceId = `proefrit-${Date.now()}`;
const { token } = await vraag('/auth/guest', {
  method: 'POST',
  body: { deviceId, displayName: 'Proefrit' },
});
if (!token) faal('Geen token gekregen van /auth/guest');
ok('speler aangemeld');

// 3. Dit is de aanroep die stukliep op een ontbrekende tabel.
const toestand = await vraag('/state', { token });
for (const sleutel of ['player', 'inventory', 'parkLoot', 'placements', 'stats']) {
  if (!(sleutel in toestand)) faal(`/state mist "${sleutel}"`, Object.keys(toestand).join(', '));
}
ok('toestand opgehaald', `level ${toestand.player.level}, ${toestand.inventory.length} stapels`);

// 4. Ligt er iets in de stad? Zonder spawns is er niets te doen.
const start = toestand.player;
const { spawns } = await vraag(`/world/spawns?x=${start.x}&z=${start.z}`, { token });
if (!Array.isArray(spawns)) faal('/world/spawns gaf geen lijst terug');
ok('items in de wereld', `${spawns.length} in beeld rond het startpunt`);

// 5. Het parkdeel. Vraagt het ontwikkelgereedschap, want zonder teleport is het
//    een wandeling van zeshonderd meter.
const dev = await vraag('/dev', { token });
if (!dev.enabled) {
  console.log(meldingen.join('\n'));
  console.log(
    '\n  ! Het parkdeel is overgeslagen: de server draait zonder DEV_TOOLS=1.' +
      '\n    Start hem met DEV_TOOLS=1 om ook de buidel en het banken te toetsen.',
  );
  console.log('\nProefrit geslaagd.\n');
  process.exit(0);
}

const { PARK_BOUNDS, PARK_CAUSEWAY, CITY_EAST_EDGE, cellToWorld } = await import(
  '../packages/shared/src/index.ts'
);

const parkMidden = cellToWorld(
  Math.floor((PARK_BOUNDS.x0 + PARK_BOUNDS.x1) / 2),
  Math.floor((PARK_BOUNDS.z0 + PARK_BOUNDS.z1) / 2),
);
await vraag('/dev/teleport', { method: 'POST', token, body: parkMidden });
ok('naar het park gesprongen', `${Math.round(parkMidden.x)}, ${Math.round(parkMidden.z)}`);

const parkSpawns = await vraag(`/world/spawns?x=${parkMidden.x}&z=${parkMidden.z}`, { token });
const buit = parkSpawns.spawns?.[0];
if (!buit) faal('Er ligt niets in het park', 'draai `pnpm db:migrate` om de stad te vullen');

await vraag('/dev/teleport', { method: 'POST', token, body: { x: buit.x, z: buit.z } });
const opgeraapt = await vraag('/world/collect', {
  method: 'POST',
  token,
  body: { spawnId: buit.id, x: buit.x, z: buit.z },
});
if (opgeraapt.inPark !== true) faal('Oprapen in het park meldt zich niet als "in het park"');
ok('iets opgeraapt in het park', opgeraapt.itemId);

const inBuidel = await vraag('/state', { token });
if (inBuidel.parkLoot.length === 0) faal('De buit staat niet in de buidel');
if (inBuidel.inventory.length !== toestand.inventory.length) {
  faal('De buit belandde in de rugzak in plaats van in de buidel — de poort doet niets');
}
ok('buit zit in de buidel, niet in de rugzak', JSON.stringify(inBuidel.parkLoot));

// 6. De landtong over. Bewust als gewone positiemelding en niet als teleport:
//    het banken hangt aan die melding, en dát is wat getoetst moet worden.
const opDeLandtong = cellToWorld(PARK_CAUSEWAY.x0 + 1, PARK_CAUSEWAY.z0);
await vraag('/dev/teleport', { method: 'POST', token, body: opDeLandtong });
const inDeStad = cellToWorld(CITY_EAST_EDGE - 1, PARK_CAUSEWAY.z0);
const overgestoken = await vraag('/player/position', {
  method: 'POST',
  token,
  body: { x: inDeStad.x, z: inDeStad.z, distance: Math.abs(inDeStad.x - opDeLandtong.x) },
});
if (overgestoken.banked !== 1) {
  faal(
    'Het oversteken heeft niets gebankt',
    `de server zette me op ${Math.round(overgestoken.x)}, ${Math.round(overgestoken.z)} ` +
      `en bankte ${overgestoken.banked}`,
  );
}
ok('de landtong over, buit gebankt');

const eind = await vraag('/state', { token });
if (eind.parkLoot.length !== 0) faal('De buidel is niet leeg na het oversteken');
if (eind.inventory.length !== toestand.inventory.length + 1) {
  faal('De buit staat niet in de rugzak', JSON.stringify(eind.inventory));
}
ok('buit staat in de rugzak', JSON.stringify(eind.inventory));

console.log(meldingen.join('\n'));
console.log('\nProefrit geslaagd.\n');
