/**
 * Je personage: naam en uiterlijk.
 *
 * Dit is de eerste steen van het roleplay-deel. Zodra je in fase 4 andere
 * spelers in dezelfde stad ziet lopen, is dit wat ze van je zien — dus de
 * definities staan hier, gedeeld door app en server, en niet in de UI.
 */

export interface Appearance {
  /** Index in SKIN_TONES. */
  skin: number;
  /** Index in OUTFIT_COLORS. */
  outfit: number;
  /** Index in ACCENT_COLORS. */
  accent: number;
}

export const SKIN_TONES: readonly string[] = [
  '#f2d7b8',
  '#e8c39e',
  '#d4a373',
  '#b07d56',
  '#8d5a3b',
  '#5c3a24',
] as const;

export const OUTFIT_COLORS: readonly string[] = [
  '#4dd4ac',
  '#38bdf8',
  '#c084fc',
  '#fb7185',
  '#fbbf24',
  '#94a3b8',
  '#1e293b',
  '#4ade80',
] as const;

export const ACCENT_COLORS: readonly string[] = [
  '#0f172a',
  '#e8edf9',
  '#f97316',
  '#22d3ee',
  '#a3e635',
  '#f43f5e',
] as const;

export const DEFAULT_APPEARANCE: Appearance = { skin: 0, outfit: 0, accent: 0 };

function clampIndex(value: unknown, length: number): number {
  const n = typeof value === 'number' ? Math.floor(value) : 0;
  if (!Number.isFinite(n) || n < 0 || n >= length) return 0;
  return n;
}

/**
 * Maakt van willekeurige opgeslagen JSON een geldig uiterlijk. De database
 * bevat een `Json`-kolom, dus alles wat eruit komt moet gecontroleerd worden
 * voordat de app het probeert te tekenen.
 */
export function normalizeAppearance(raw: unknown): Appearance {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_APPEARANCE };
  const value = raw as Record<string, unknown>;
  return {
    skin: clampIndex(value.skin, SKIN_TONES.length),
    outfit: clampIndex(value.outfit, OUTFIT_COLORS.length),
    accent: clampIndex(value.accent, ACCENT_COLORS.length),
  };
}

/** De kleuren die bij een uiterlijk horen, klaar om te renderen. */
export function appearanceColors(appearance: Appearance): {
  skin: string;
  outfit: string;
  accent: string;
} {
  return {
    skin: SKIN_TONES[appearance.skin] ?? SKIN_TONES[0]!,
    outfit: OUTFIT_COLORS[appearance.outfit] ?? OUTFIT_COLORS[0]!,
    accent: ACCENT_COLORS[appearance.accent] ?? ACCENT_COLORS[0]!,
  };
}

// ---------------------------------------------------------------------------
// Namen
// ---------------------------------------------------------------------------

export const DISPLAY_NAME_MIN = 3;
export const DISPLAY_NAME_MAX = 18;

/**
 * Namen die andere spelers gaan zien, dus hier wordt wel op gelet. Dit is
 * bewust een basiscontrole op vorm — echte moderatie (rapporteren, blokkeren,
 * een woordenlijst die bijgehouden wordt) hoort bij chat in fase 4.
 */
const NAME_PATTERN = /^[\p{L}\p{N} _-]+$/u;

export type NameProblem =
  | 'too_short'
  | 'too_long'
  | 'invalid_characters'
  | 'bad_spacing'
  | 'reserved';

const RESERVED_NAMES = ['admin', 'moderator', 'systeem', 'system', 'server', 'claude'];

export function validateDisplayName(raw: string): { ok: true; name: string } | { ok: false; problem: NameProblem } {
  const name = raw.trim().replace(/\s+/g, ' ');

  if (name.length < DISPLAY_NAME_MIN) return { ok: false, problem: 'too_short' };
  if (name.length > DISPLAY_NAME_MAX) return { ok: false, problem: 'too_long' };
  if (!NAME_PATTERN.test(name)) return { ok: false, problem: 'invalid_characters' };
  if (name !== raw.trim()) return { ok: false, problem: 'bad_spacing' };
  if (RESERVED_NAMES.some((reserved) => name.toLowerCase().includes(reserved))) {
    return { ok: false, problem: 'reserved' };
  }
  return { ok: true, name };
}

export const NAME_PROBLEM_MESSAGE: Readonly<Record<NameProblem, string>> = {
  too_short: `Minimaal ${DISPLAY_NAME_MIN} tekens.`,
  too_long: `Maximaal ${DISPLAY_NAME_MAX} tekens.`,
  invalid_characters: 'Alleen letters, cijfers, spaties, - en _.',
  bad_spacing: 'Geen dubbele spaties of spaties aan het begin of eind.',
  reserved: 'Deze naam is gereserveerd.',
};
