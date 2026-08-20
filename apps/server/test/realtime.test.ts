import { REALTIME, spawnPosition, type ServerMessage } from '@game/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * De gedeelde wereld, van handshake tot momentopname.
 *
 * De database wordt hier vervangen door een paar vaste spelers. Dat is precies
 * genoeg: deze laag doet niets met de database behalve één keer een profiel
 * ophalen, en het interessante zit in de handshake, de snelheidscontrole en
 * wie wie te zien krijgt. Zonder deze test zou je een fout hier pas op twee
 * telefoons ontdekken.
 */

const PLAYERS: Record<string, { displayName: string; x: number; z: number }> = {
  anna: { displayName: 'Anna', x: 0, z: 0 },
  bram: { displayName: 'Bram', x: 0, z: 0 },
  // Ver Weg staat al aan de andere kant van de stad. Hem daarheen laten
  // lópen kan niet in één bericht — dat weigert de snelheidscontrole, en
  // terecht.
  ver: { displayName: 'Ver Weg', x: 400, z: 400 },
};

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    player: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const player = PLAYERS[where.id];
        if (!player) return null;
        return {
          displayName: player.displayName,
          xp: 0,
          vehicleId: 'on_foot',
          propertyId: 'squat',
          appearance: {},
          x: player.x,
          z: player.z,
          upgrades: [],
        };
      },
    },
  },
  disconnectPrisma: async () => {},
}));

const SECRET = 'test-geheim-voor-de-gedeelde-wereld';
let app: FastifyInstance;
let url: string;

/**
 * Een testclient die alles bewaart wat er binnenkomt.
 *
 * Het welkomstbericht komt vrijwel direct na de handshake — sneller dan een
 * test een luisteraar kan ophangen. Daarom wordt er vanaf het begin gebufferd
 * en zoekt `wait` eerst in wat er al ligt.
 */
interface Client {
  socket: WebSocket;
  received: ServerMessage[];
  wait: <T extends ServerMessage>(
    match: (message: ServerMessage) => boolean,
    timeoutMs?: number,
  ) => Promise<T>;
  move: (x: number, z: number, driving?: 0 | 1) => void;
  close: () => void;
}

async function connect(playerId: string): Promise<Client> {
  const token = app.jwt.sign({ sub: playerId });
  const socket = new WebSocket(`${url}${REALTIME.path}?token=${token}`);
  const received: ServerMessage[] = [];
  socket.on('message', (raw: WebSocket.RawData) => {
    received.push(JSON.parse(raw.toString()) as ServerMessage);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });

  return {
    socket,
    received,
    wait<T extends ServerMessage>(match: (m: ServerMessage) => boolean, timeoutMs = 4000) {
      return new Promise<T>((resolve, reject) => {
        const found = received.find(match);
        if (found) {
          resolve(found as T);
          return;
        }
        const timer = setTimeout(() => {
          socket.off('message', onMessage);
          reject(new Error('geen passend bericht binnen de tijd'));
        }, timeoutMs);
        function onMessage(raw: WebSocket.RawData): void {
          const message = JSON.parse(raw.toString()) as ServerMessage;
          if (!match(message)) return;
          clearTimeout(timer);
          socket.off('message', onMessage);
          resolve(message as T);
        }
        socket.on('message', onMessage);
      });
    },
    move(x, z, driving = 0) {
      socket.send(JSON.stringify({ t: 'move', x, z, h: 0, d: driving }));
    },
    close() {
      socket.close();
    },
  };
}

beforeAll(async () => {
  const { realtimeRoutes } = await import('../src/realtime/city.js');
  app = Fastify({ logger: false });
  await app.register(jwt, { secret: SECRET });
  await app.register(realtimeRoutes);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  url = `ws://127.0.0.1:${port}`;
});

afterAll(async () => {
  await app.close();
});

describe('gedeelde wereld', () => {
  it('weigert een verbinding zonder geldig token', async () => {
    const socket = new WebSocket(`${url}${REALTIME.path}?token=onzin`);
    const code = await new Promise<number>((resolve) => {
      socket.on('close', (closeCode) => resolve(closeCode));
    });
    expect(code).toBe(4001);
  });

  it('begroet een speler met zijn eigen id', async () => {
    const anna = await connect('anna');
    expect(await anna.wait((m) => m.t === 'welcome')).toMatchObject({ t: 'welcome', id: 'anna' });
    anna.close();
  });

  it('laat twee spelers in de buurt elkaar zien, met naam en niveau', async () => {
    const anna = await connect('anna');
    const bram = await connect('bram');
    await anna.wait((m) => m.t === 'welcome');
    await bram.wait((m) => m.t === 'welcome');

    const spawn = spawnPosition();
    anna.move(spawn.x, spawn.z);
    bram.move(spawn.x + 5, spawn.z);

    const snapshot = await anna.wait(
      (m) => m.t === 'snapshot' && m.players.some((p) => p.id === 'bram'),
    );
    const other = (snapshot as { players: { id: string; n: string; level: number }[] }).players.find(
      (p) => p.id === 'bram',
    );
    expect(other?.n).toBe('Bram');
    expect(other?.level).toBeGreaterThan(0);

    anna.close();
    bram.close();
  });

  it('toont niemand die buiten het zichtgebied staat', async () => {
    const anna = await connect('anna');
    const ver = await connect('ver');
    await anna.wait((m) => m.t === 'welcome');
    await ver.wait((m) => m.t === 'welcome');

    const spawn = spawnPosition();
    anna.move(spawn.x, spawn.z);
    expect(Math.hypot(400 - spawn.x, 400 - spawn.z)).toBeGreaterThan(REALTIME.interestRadius);

    // Een paar tikken laten passeren en dan kijken of hij er echt niet bij zit.
    await new Promise((resolve) => setTimeout(resolve, 600));
    const snapshots = anna.received.filter(
      (m): m is Extract<ServerMessage, { t: 'snapshot' }> => m.t === 'snapshot',
    );
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.flatMap((m) => m.players.map((p) => p.id))).not.toContain('ver');

    anna.close();
    ver.close();
  });

  it('neemt een sprong die niet te lopen is niet over', async () => {
    const anna = await connect('anna');
    const bram = await connect('bram');
    await anna.wait((m) => m.t === 'welcome');
    await bram.wait((m) => m.t === 'welcome');

    const spawn = spawnPosition();
    anna.move(spawn.x, spawn.z);
    bram.move(spawn.x + 4, spawn.z);
    await anna.wait((m) => m.t === 'snapshot' && m.players.some((p) => p.id === 'bram'));

    // Bram beweert meteen honderd meter verderop te staan. Dat past niet in
    // het snelheidsbudget, dus voor Anna blijft hij staan waar hij stond.
    bram.move(spawn.x + 100, spawn.z);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const after = anna.received
      .filter((m): m is Extract<ServerMessage, { t: 'snapshot' }> => m.t === 'snapshot')
      .at(-1)!;
    const bramNow = (after as { players: { id: string; x: number }[] }).players.find(
      (p) => p.id === 'bram',
    );
    expect(Math.abs((bramNow?.x ?? 0) - (spawn.x + 4))).toBeLessThan(20);

    anna.close();
    bram.close();
  });

  it('verbreekt de oude verbinding als dezelfde speler opnieuw inlogt', async () => {
    const first = await connect('anna');
    await first.wait((m) => m.t === 'welcome');

    const closed = new Promise<number>((resolve) => first.socket.on('close', resolve));
    const second = await connect('anna');
    await second.wait((m) => m.t === 'welcome');

    expect(await closed).toBe(4000);
    second.close();
  });
});
