/**
 * Deterministische pseudo-random generator.
 *
 * Client en server moeten *exact* dezelfde stad genereren, dus we gebruiken
 * nooit Math.random() voor werelddata. Mulberry32 is klein, snel en geeft op
 * elke JS-engine dezelfde reeks voor dezelfde seed.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mengt meerdere getallen tot één 32-bits seed (voor per-cel randomness). */
export function hashSeed(...values: number[]): number {
  let h = 2166136261 >>> 0;
  for (const v of values) {
    h ^= Math.imul(v | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 13), 0x85ebca6b);
    h = (h ^ (h >>> 16)) >>> 0;
  }
  return h >>> 0;
}

/** Stabiele random waarde 0..1 voor een specifieke cel/positie. */
export function valueAt(...values: number[]): number {
  return mulberry32(hashSeed(...values))();
}

/** Kiest een element op basis van gewichten. `rand` is een waarde 0..1. */
export function weightedPick<T extends string>(
  weights: Readonly<Record<T, number>>,
  rand: number,
): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) {
    const first = entries[0];
    if (!first) throw new Error('weightedPick: lege gewichtentabel');
    return first[0];
  }
  let threshold = rand * total;
  for (const [key, weight] of entries) {
    threshold -= weight;
    if (threshold <= 0) return key;
  }
  return entries[entries.length - 1]![0];
}

/** Willekeurig geheel getal in [min, max] op basis van een 0..1 waarde. */
export function randInt(rand: number, min: number, max: number): number {
  return min + Math.floor(rand * (max - min + 1));
}
