import { REALTIME, type DownedMessage, type ServerMessage } from '@game/shared';
import { API_URL, currentToken } from './api';
import { clearPresence, ingestSnapshot, localPresence, realtime } from './presence';

/**
 * De verbinding met de gedeelde stad.
 *
 * Dit bestand doet alleen het verkeer: verbinden, melden waar je staat, en
 * binnenkomende momentopnames doorgeven aan `presence.ts`. Wie er waar loopt
 * staat daar, zodat de 3D-laag niets van WebSockets hoeft te weten.
 */

let socket: WebSocket | null = null;
let reportTimer: ReturnType<typeof setInterval> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;
let wanted = false;

function websocketUrl(token: string): string {
  const base = API_URL.replace(/^http/, 'ws');
  return `${base}${REALTIME.path}?token=${encodeURIComponent(token)}`;
}

function scheduleRetry(): void {
  if (!wanted || retryTimer) return;
  // Oplopend wachten, met een plafond: bij een server die uit staat willen we
  // niet elke seconde opnieuw aankloppen, maar wel snel terug zijn als hij
  // weer aan gaat.
  const wait = Math.min(15_000, 700 * 2 ** attempt);
  attempt++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void open();
  }, wait);
}

async function open(): Promise<void> {
  if (!wanted || socket) return;
  const token = await currentToken();
  if (!token) {
    scheduleRetry();
    return;
  }

  const next = new WebSocket(websocketUrl(token));
  socket = next;

  next.onopen = () => {
    attempt = 0;
    realtime.connected = true;
    reportTimer = setInterval(() => {
      if (next.readyState !== 1) return;
      next.send(
        JSON.stringify({
          t: 'move',
          x: Math.round(localPresence.x * 100) / 100,
          z: Math.round(localPresence.z * 100) / 100,
          h: Math.round(localPresence.heading * 1000) / 1000,
          d: localPresence.driving,
        }),
      );
    }, Math.round(1000 / REALTIME.reportHz));
  };

  next.onmessage = (event) => {
    try {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.t === 'welcome') {
        realtime.id = message.id;
      } else if (message.t === 'snapshot') {
        ingestSnapshot(message);
      } else if (message.t === 'downed') {
        onDowned?.(message);
      }
    } catch {
      // Een onbegrijpelijk bericht negeren we; de volgende komt over 100 ms.
    }
  };

  const shutdown = (): void => {
    if (socket !== next) return;
    socket = null;
    realtime.connected = false;
    if (reportTimer) {
      clearInterval(reportTimer);
      reportTimer = null;
    }
    clearPresence();
    scheduleRetry();
  };
  next.onclose = shutdown;
  next.onerror = shutdown;
}

/**
 * Wie er geïnformeerd wordt als je neergaat.
 *
 * Dit bestand doet alleen verkeer en weet niets van de HUD of van de speltoestand;
 * `city.tsx` hangt hier zijn afhandeling in. Zo hoeft de netwerklaag geen store te
 * importeren en blijft de richting één kant op.
 */
let onDowned: ((message: DownedMessage) => void) | null = null;

export function setDownedHandler(handler: ((message: DownedMessage) => void) | null): void {
  onDowned = handler;
}

/**
 * Een klap uitdelen: alleen een póging, met wie je probeert te raken.
 *
 * De server beslist op basis van posities die hij zelf bijhoudt. Lukt het niet —
 * te ver, te snel, of niet in het park — dan gebeurt er stil niets.
 */
export function sendAttack(targetId: string): void {
  if (!socket || socket.readyState !== 1) return;
  socket.send(JSON.stringify({ t: 'attack', target: targetId }));
}

/** Verbinden met de gedeelde stad. Herstelt zichzelf na een storing. */
export function joinCity(): void {
  wanted = true;
  attempt = 0;
  void open();
}

/** Verbinding verbreken, bijvoorbeeld als je de stad uit gaat naar een menu. */
export function leaveCity(): void {
  wanted = false;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  socket?.close();
  socket = null;
  realtime.connected = false;
  if (reportTimer) {
    clearInterval(reportTimer);
    reportTimer = null;
  }
  clearPresence();
}
