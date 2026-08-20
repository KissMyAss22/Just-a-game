import { REALTIME, type ServerMessage } from '@game/shared';
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
