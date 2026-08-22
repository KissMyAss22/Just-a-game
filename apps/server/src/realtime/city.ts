import {
  REALTIME,
  applyDamage,
  cellToWorld,
  clientMessageSchema,
  DEV_SPEED_ALLOWANCE,
  judgeAttack,
  MAX_HP,
  moveBudget,
  PARK_CAUSEWAY,
  withinInterest,
  computeStats,
  levelFromTotalXp,
  normalizeAppearance,
  resolveMovement,
  type RemotePlayer,
  type ServerMessage,
} from '@game/shared';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { env } from '../env.js';
import { prisma } from '../lib/prisma.js';

/**
 * De gedeelde stad.
 *
 * Elke verbinding is één speler. Tien keer per seconde krijgt iedereen een
 * momentopname van wie er in de buurt is. Verder gebeurt hier niets: de
 * autoriteit over geld, items en je opgeslagen positie blijft bij de
 * REST-laag. Deze laag gaat puur over "wie loopt waar op dit moment", en dat
 * hoeft niet in de database te staan.
 *
 * Wat hier wél gecontroleerd wordt is de verplaatsing. Een gemelde positie
 * wordt door dezelfde `resolveMovement` gehaald als in de REST-laag en tegen
 * hetzelfde snelheidsbudget gelegd. Anders zou één speler met een aangepaste
 * client bij iedereen door de gevels heen lijken te vliegen.
 */

/** Speling op het snelheidsbudget, voor haperend netwerk. */
const SPEED_TOLERANCE_M = 12;
/** Zo vaak halen we naam, uiterlijk en voertuig opnieuw uit de database. */
const PROFILE_REFRESH_MS = 30_000;
/** Boven dit gat rekenen we niet verder terug; anders spaar je teleportbudget op. */
const MAX_GAP_SECONDS = 5;

interface Connected {
  socket: WebSocket;
  playerId: string;
  /** Naam, uiterlijk en voertuig; komen uit de database, niet van de client. */
  profile: {
    name: string;
    level: number;
    vehicleId: string;
    skin: number;
    outfit: number;
    accent: number;
    /** Topsnelheid waarop de verplaatsing wordt getoetst. */
    topSpeed: number;
  };
  x: number;
  z: number;
  heading: number;
  driving: 0 | 1;
  /** Wanneer de laatste geaccepteerde positie binnenkwam. */
  movedAt: number;
  lastSeen: number;
  profileAt: number;
  /**
   * Levenspunten. Leven alleen hier, niet in de database.
   *
   * Dat is een bewuste keuze: verbreek je de verbinding, dan sta je er de
   * volgende keer weer fris bij. Hp is geen bezit — je buidel wel, en die staat
   * daarom wél in de database. Wie zich uit een gevecht wegklikt verliest zijn
   * buidel niet, maar hij is ook zijn plek in het park kwijt, en dat is de
   * eerlijke ruil zonder dat er een verbindingsstraf voor nodig is.
   */
  hp: number;
  /** Wanneer deze speler voor het laatst sloeg; voor de cadans. */
  attackedAt: number;
  /** Voor de snelheidslimiet op berichten. */
  windowStart: number;
  windowCount: number;
}

const connected = new Map<string, Connected>();

/**
 * Oefenpoppen uit het testgereedschap.
 *
 * PvP bleef tot nu toe liggen omdat er een tweede speler voor nodig is, en een
 * ronde die je niet kunt beoordelen is niet af. Een pop komt gewoon mee in de
 * momentopname en incasseert klappen; verder doet hij niets. Ze staan in een
 * eigen tabel en niet tussen de echte verbindingen, want alles wat een `socket`
 * verwacht zou dan een uitzondering moeten krijgen.
 */
interface Dummy {
  id: string;
  name: string;
  x: number;
  z: number;
  hp: number;
  /** Wanneer hij is neergezet; na een tijd ruimt hij zichzelf op. */
  bornAt: number;
}

const dummies = new Map<string, Dummy>();

/** Hoe lang een oefenpop blijft staan als je hem vergeet. */
const DUMMY_LIFETIME_MS = 10 * 60_000;

/**
 * Zet een oefenpop neer. Alleen bereikbaar via het testgereedschap, dat in
 * productie niet aan kan staan.
 */
export function spawnDummy(x: number, z: number): { id: string; name: string } {
  const id = `pop-${Math.random().toString(36).slice(2, 9)}`;
  const naam = `Oefenpop ${dummies.size + 1}`;
  dummies.set(id, { id, name: naam, x, z, hp: MAX_HP, bornAt: Date.now() });
  return { id, name: naam };
}

/** Alle oefenpoppen weghalen. */
export function clearDummies(): number {
  const aantal = dummies.size;
  dummies.clear();
  return aantal;
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(message));
}

async function loadProfile(playerId: string): Promise<Connected['profile'] | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      displayName: true,
      xp: true,
      vehicleId: true,
      propertyId: true,
      appearance: true,
      x: true,
      z: true,
      upgrades: { select: { upgradeId: true, level: true } },
    },
  });
  if (!player) return null;

  const appearance = normalizeAppearance(player.appearance);
  const upgrades: Record<string, number> = {};
  for (const upgrade of player.upgrades) upgrades[upgrade.upgradeId] = upgrade.level;

  // Alleen de snelheid hoeft echt uitgerekend te worden; die bepaalt hoe ver
  // iemand in een tiende seconde mag zijn opgeschoven.
  const stats = computeStats({
    propertyId: player.propertyId,
    vehicleId: player.vehicleId,
    upgrades,
    placements: [],
  });

  return {
    name: player.displayName,
    level: levelFromTotalXp(player.xp).level,
    vehicleId: player.vehicleId,
    skin: appearance.skin,
    outfit: appearance.outfit,
    accent: appearance.accent,
    topSpeed: stats.moveSpeed,
  };
}

/** De spelers die deze speler op dit moment zou moeten zien. */
function nearby(self: Connected): RemotePlayer[] {
  const others: Connected[] = [];
  for (const other of connected.values()) {
    if (other.playerId !== self.playerId) others.push(other);
  }

  const echte = withinInterest(self, others).map((player) => ({
    id: player.playerId,
    n: player.profile.name,
    x: Math.round(player.x * 100) / 100,
    z: Math.round(player.z * 100) / 100,
    h: Math.round(player.heading * 1000) / 1000,
    d: player.driving,
    v: player.profile.vehicleId,
    level: player.profile.level,
    s: player.profile.skin,
    o: player.profile.outfit,
    a: player.profile.accent,
    hp: player.hp,
  }));

  // Oefenpoppen erachteraan. Ze zien er hetzelfde uit als een speler, want
  // anders test je niet wat je denkt te testen.
  const poppen = withinInterest(self, [...dummies.values()]).map((pop) => ({
    id: pop.id,
    n: pop.name,
    x: Math.round(pop.x * 100) / 100,
    z: Math.round(pop.z * 100) / 100,
    h: 0,
    d: 0 as const,
    v: 'none',
    level: 1,
    s: 0,
    o: 0,
    a: 0,
    hp: pop.hp,
  }));

  return [...echte, ...poppen];
}

/**
 * Neemt een gemelde positie aan, mits die haalbaar is. Zo niet, dan blijft de
 * speler staan waar hij stond — hij wordt niet weggegooid, want een slechte
 * verbinding is geen valsspelen.
 */
function applyMove(entry: Connected, x: number, z: number, heading: number, driving: 0 | 1): void {
  const now = Date.now();
  const elapsed = Math.min(MAX_GAP_SECONDS, Math.max(0, now - entry.movedAt) / 1000);
  const budget = moveBudget(
    entry.profile.topSpeed,
    elapsed,
    SPEED_TOLERANCE_M,
    env.devTools ? DEV_SPEED_ALLOWANCE : undefined,
  );
  const travelled = Math.hypot(x - entry.x, z - entry.z);

  if (travelled <= budget) {
    const safe = resolveMovement(entry.x, entry.z, x, z, 0.45);
    entry.x = safe.x;
    entry.z = safe.z;
  }
  entry.heading = heading;
  entry.driving = driving;
  entry.movedAt = now;
  entry.lastSeen = now;
}

/**
 * Waar je opnieuw begint als je neergaat: aan de stádskant van de landtong.
 *
 * Niet in het park, want dan sta je meteen weer naast degene die je net
 * neerhaalde. Niet bij je huis, want dan is neergaan een gratis reis naar de
 * andere kant van de kaart. De landtong is de plek waar je hoe dan ook langs
 * moet, dus terugkomen kost precies de wandeling die je net had gemaakt.
 */
function respawnSpot(): { x: number; z: number } {
  const midden = cellToWorld(PARK_CAUSEWAY.x0 - 2, (PARK_CAUSEWAY.z0 + PARK_CAUSEWAY.z1 - 1) / 2);
  return { x: midden.x, z: midden.z };
}

/** Hoe lang gevallen buit op de grond blijft liggen voordat hij verdwijnt. */
const DROPPED_LOOT_MINUTES = 3;

/**
 * Iemand gaat neer.
 *
 * Zijn buidel valt op de grond: de `ParkLoot`-rijen worden `Spawn`-rijen op de
 * plek waar hij stond. Geen nieuwe tabel — `Spawn` heeft al itemId, rarity, x, z
 * en expiresAt, en de bestaande opraaproute werkt er meteen op. Dat is ook
 * precies wat "hij ligt er even voor iedereen" betekent: wie er als eerste bij
 * is, mag hem hebben.
 *
 * Zijn rugzak, cash, meubels en base blijven onaangeroerd. Dat was een
 * uitgesproken keuze en het beschermt het idle-deel van het spel: één avond pech
 * mag geen week werk kosten.
 */
async function goDown(app: FastifyInstance, victim: Connected, attackerName: string): Promise<void> {
  const spot = respawnSpot();
  const droppedAt = { x: victim.x, z: victim.z };
  let lost = 0;

  try {
    lost = await prisma.$transaction(async (tx) => {
      const pouch = await tx.parkLoot.findMany({
        where: { playerId: victim.playerId, quantity: { gt: 0 } },
      });
      if (pouch.length > 0) {
        const expiresAt = new Date(Date.now() + DROPPED_LOOT_MINUTES * 60_000);
        await tx.spawn.createMany({
          data: pouch.flatMap((row) =>
            // Eén rij per stuk, want een Spawn is één voorwerp. Dat is ook hoe
            // het eruitziet: een handvol dingen naast elkaar in het gras.
            Array.from({ length: row.quantity }, (_, i) => ({
              districtId: 'park',
              itemId: row.itemId,
              rarity: 'rare',
              // Iets uit elkaar, anders liggen ze allemaal op één punt.
              x: droppedAt.x + Math.cos(i * 2.4) * (0.8 + i * 0.25),
              z: droppedAt.z + Math.sin(i * 2.4) * (0.8 + i * 0.25),
              expiresAt,
            })),
          ),
        });
        await tx.parkLoot.deleteMany({ where: { playerId: victim.playerId } });
      }

      // De opgeslagen positie moet mee: de REST-laag toetst handelingen tegen
      // `player.x/z`, en die mag niet achterblijven in het park.
      await tx.player.update({
        where: { id: victim.playerId },
        data: { x: spot.x, z: spot.z },
      });

      return pouch.reduce((som, row) => som + row.quantity, 0);
    });
  } catch (error) {
    // Ligt de database eruit, dan gaat de speler alsnog terug naar de stadskant.
    // Zijn buidel blijft dan staan, en dat is de goede kant om op te falen.
    app.log.error({ err: error, playerId: victim.playerId }, 'kon neergaan niet verwerken');
  }

  victim.hp = MAX_HP;
  victim.x = spot.x;
  victim.z = spot.z;
  victim.movedAt = Date.now();
  send(victim.socket, { t: 'downed', by: attackerName, lost, x: spot.x, z: spot.z });
  app.log.info({ playerId: victim.playerId, by: attackerName, lost }, 'speler neergegaan');
}

/**
 * Een gemelde klap.
 *
 * De client meldt alleen wíé hij probeert te raken. Afstand, cadans en of jullie
 * allebei op de parkzijde staan worden hier getoetst, tegen posities die de
 * server zelf bijhoudt. Een geweigerde klap wordt stil genegeerd: een haperende
 * verbinding die twee berichten tegelijk aflevert is geen valsspelen.
 */
function applyAttack(app: FastifyInstance, attacker: Connected, targetId: string): void {
  const now = Date.now();

  // Een oefenpop volgt exact dezelfde regels — dat is het hele punt van een
  // oefenpop. Alleen valt er niets uit als hij omgaat.
  const pop = dummies.get(targetId);
  if (pop) {
    const oordeel = judgeAttack({
      attacker: { x: attacker.x, z: attacker.z },
      target: { x: pop.x, z: pop.z, hp: pop.hp },
      sinceLastAttackMs: now - attacker.attackedAt,
    });
    if (oordeel !== 'ok') return;
    attacker.attackedAt = now;
    pop.hp = applyDamage(pop.hp);
    if (pop.hp <= 0) {
      dummies.delete(pop.id);
      app.log.info({ pop: pop.id }, 'oefenpop omgegaan');
    }
    return;
  }

  const target = connected.get(targetId);
  if (!target || target.playerId === attacker.playerId) return;

  const verdict = judgeAttack({
    attacker: { x: attacker.x, z: attacker.z },
    target: { x: target.x, z: target.z, hp: target.hp },
    sinceLastAttackMs: now - attacker.attackedAt,
  });
  if (verdict !== 'ok') return;

  attacker.attackedAt = now;
  attacker.lastSeen = now;
  target.hp = applyDamage(target.hp);
  if (target.hp <= 0) void goDown(app, target, attacker.profile.name);
}

export async function realtimeRoutes(app: FastifyInstance): Promise<void> {
  const websocket = await import('@fastify/websocket');
  await app.register(websocket.default, {
    options: { maxPayload: 4096 },
  });

  app.get(REALTIME.path, { websocket: true }, (socket, request) => {
    // Het token staat in de querystring: een WebSocket-handshake vanuit een
    // browser of React Native kan geen eigen headers meesturen.
    const token = (request.query as { token?: string } | undefined)?.token;
    let playerId: string;
    try {
      playerId = app.jwt.verify<{ sub: string }>(String(token ?? '')).sub;
    } catch {
      socket.close(4001, 'unauthorized');
      return;
    }

    // Twee verbindingen van dezelfde speler: de oude gaat eruit.
    connected.get(playerId)?.socket.close(4000, 'replaced');

    void (async () => {
      const profile = await loadProfile(playerId);
      if (!profile) {
        socket.close(4004, 'unknown_player');
        return;
      }
      const player = await prisma.player.findUnique({
        where: { id: playerId },
        select: { x: true, z: true },
      });
      const now = Date.now();
      const entry: Connected = {
        socket,
        playerId,
        profile,
        x: player?.x ?? 0,
        z: player?.z ?? 0,
        heading: 0,
        driving: 0,
        movedAt: now,
        lastSeen: now,
        profileAt: now,
        hp: MAX_HP,
        attackedAt: 0,
        windowStart: now,
        windowCount: 0,
      };
      connected.set(playerId, entry);
      send(socket, { t: 'welcome', id: playerId, now });
      app.log.info({ playerId, online: connected.size }, 'speler in de stad');
    })().catch((error) => {
      // Ligt de database eruit, dan moet de client een nette afsluiting
      // krijgen in plaats van een verbinding die blijft hangen.
      app.log.error({ err: error, playerId }, 'kon speler niet toelaten');
      socket.close(4500, 'server_error');
    });

    socket.on('message', (raw: Buffer) => {
      const entry = connected.get(playerId);
      if (!entry || entry.socket !== socket) return;

      const now = Date.now();
      if (now - entry.windowStart > 1000) {
        entry.windowStart = now;
        entry.windowCount = 0;
      }
      entry.windowCount++;
      if (entry.windowCount > REALTIME.maxMessagesPerSecond) {
        socket.close(4029, 'too_many_messages');
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const message = clientMessageSchema.safeParse(parsed);
      if (!message.success) return;
      if (message.data.t === 'attack') {
        applyAttack(app, entry, message.data.target);
        return;
      }
      applyMove(entry, message.data.x, message.data.z, message.data.h, message.data.d);
    });

    const forget = (): void => {
      const entry = connected.get(playerId);
      if (entry?.socket === socket) {
        connected.delete(playerId);
        app.log.info({ playerId, online: connected.size }, 'speler uit de stad');
      }
    };
    socket.on('close', forget);
    socket.on('error', forget);
  });

  const tick = setInterval(() => {
    const now = Date.now();
    for (const pop of dummies.values()) {
      if (now - pop.bornAt > DUMMY_LIFETIME_MS) dummies.delete(pop.id);
    }
    for (const entry of connected.values()) {
      if (now - entry.lastSeen > REALTIME.timeoutMs) {
        entry.socket.close(4008, 'timeout');
        connected.delete(entry.playerId);
        continue;
      }
      if (now - entry.profileAt > PROFILE_REFRESH_MS) {
        entry.profileAt = now;
        void loadProfile(entry.playerId).then((profile) => {
          if (profile) entry.profile = profile;
        });
      }
      send(entry.socket, { t: 'snapshot', at: now, players: nearby(entry) });
    }
  }, Math.round(1000 / REALTIME.tickHz));
  tick.unref();

  app.addHook('onClose', async () => {
    clearInterval(tick);
    for (const entry of connected.values()) entry.socket.close(1001, 'server_closing');
    connected.clear();
  });
}

/** Hoeveel spelers er nu in de stad lopen. Voor logging en statistiek. */
export function onlineCount(): number {
  return connected.size;
}
