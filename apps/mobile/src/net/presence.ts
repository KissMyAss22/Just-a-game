import type { RemotePlayer, SnapshotMessage } from '@game/shared';

/**
 * Wie er op dit moment om je heen loopt.
 *
 * Bewust los van de verbinding: dit bestand weet niets van WebSockets, tokens
 * of Expo. Daardoor kan de 3D-laag het gebruiken zonder de netwerklaag mee te
 * slepen — en kan de renderproef in de browser er nepspelers in zetten om te
 * controleren of ze er goed uitzien.
 *
 * Alles leeft hier buiten React. Andere spelers bewegen tien keer per seconde;
 * dat door een componentenboom halen zou de app op zijn knieën krijgen.
 */

export interface TrackedPlayer {
  /** Wat de server het laatst doorgaf. */
  latest: RemotePlayer;
  /** De stand daarvoor, om tussen te interpoleren. */
  previous: RemotePlayer;
  /** Wanneer `latest` binnenkwam, in tijd van dit toestel. */
  at: number;
  /** Wanneer `previous` binnenkwam. */
  previousAt: number;
}

/** Iedereen die op dit moment in beeld is, op speler-id. */
export const remotePlayers = new Map<string, TrackedPlayer>();

/** Je eigen id en de staat van de verbinding. */
export const realtime = { id: '', connected: false, lastSnapshotAt: 0 };

/** Wat de client doorgeeft over jezelf; de 3D-laag vult dit elke frame. */
export const localPresence = { x: 0, z: 0, heading: 0, driving: 0 as 0 | 1 };

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

/** Meekijken hoeveel spelers er in beeld zijn. Alleen voor de HUD. */
export function onCrowdChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(): void {
  for (const listener of listeners) listener(remotePlayers.size);
}

/** Een momentopname verwerken: bijwerken wie er is en wie er weg is. */
export function ingestSnapshot(message: SnapshotMessage, now = Date.now()): void {
  realtime.lastSnapshotAt = now;
  const seen = new Set<string>();
  let changed = false;

  for (const player of message.players) {
    seen.add(player.id);
    const existing = remotePlayers.get(player.id);
    if (existing) {
      existing.previous = existing.latest;
      existing.previousAt = existing.at;
      existing.latest = player;
      existing.at = now;
    } else {
      remotePlayers.set(player.id, { latest: player, previous: player, at: now, previousAt: now });
      changed = true;
    }
  }

  for (const id of [...remotePlayers.keys()]) {
    if (seen.has(id)) continue;
    remotePlayers.delete(id);
    changed = true;
  }
  if (changed) announce();
}

/** Alles vergeten, bijvoorbeeld als de verbinding wegvalt. */
export function clearPresence(): void {
  if (remotePlayers.size === 0) return;
  remotePlayers.clear();
  announce();
}

/**
 * Waar een speler nú staat.
 *
 * De server stuurt tien keer per seconde; het scherm tekent zestig keer. Zonder
 * ertussen te rekenen zou iedereen schokkend vooruit springen. We lopen bewust
 * één pakket achter: dan is er altijd een volgende stand om naartoe te
 * bewegen, in plaats van te moeten raden waar iemand heen gaat.
 */
export function interpolate(
  tracked: TrackedPlayer,
  now: number,
): { x: number; z: number; heading: number } {
  const span = Math.max(1, tracked.at - tracked.previousAt);
  const t = Math.min(1, Math.max(0, (now - tracked.at) / span));
  const from = tracked.previous;
  const to = tracked.latest;

  // Kortste weg om de cirkel, anders draait iemand een hele slag terug als hij
  // van +179 naar -179 graden gaat.
  let turn = ((to.h - from.h + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (turn < -Math.PI) turn += Math.PI * 2;

  return {
    x: from.x + (to.x - from.x) * t,
    z: from.z + (to.z - from.z) * t,
    heading: from.h + turn * t,
  };
}
