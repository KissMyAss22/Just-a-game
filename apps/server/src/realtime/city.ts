import {
  REALTIME,
  clientMessageSchema,
  moveBudget,
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
  /** Voor de snelheidslimiet op berichten. */
  windowStart: number;
  windowCount: number;
}

const connected = new Map<string, Connected>();

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

  return withinInterest(self, others).map((player) => ({
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
  }));
}

/**
 * Neemt een gemelde positie aan, mits die haalbaar is. Zo niet, dan blijft de
 * speler staan waar hij stond — hij wordt niet weggegooid, want een slechte
 * verbinding is geen valsspelen.
 */
function applyMove(entry: Connected, x: number, z: number, heading: number, driving: 0 | 1): void {
  const now = Date.now();
  const elapsed = Math.min(MAX_GAP_SECONDS, Math.max(0, now - entry.movedAt) / 1000);
  const budget = moveBudget(entry.profile.topSpeed, elapsed, SPEED_TOLERANCE_M);
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
