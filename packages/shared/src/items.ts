import type { DistrictId } from './city/districts';
import type { ItemCategory, ItemDef, Rarity } from './types';

/** Item met de districten waar het extra vaak voorkomt. */
export interface LootItemDef extends ItemDef {
  /** Leeg = kan overal vallen. Anders alleen in deze districten. */
  districts?: readonly DistrictId[];
  /** Alleen te maken bij de werkbank; ligt nooit op straat. */
  craftOnly?: boolean;
}

/**
 * Alle items in het spel. Definities staan bewust in code en niet in de
 * database: balanceren is dan een code-wijziging met git-historie, en de
 * client kent ze zonder extra request.
 *
 * `baseValue` is de verkoopprijs in cash, inclusief zeldzaamheid.
 */
export const ITEMS: readonly LootItemDef[] = [
  // --- common -------------------------------------------------------------
  { id: 'coins', name: 'Los muntgeld', category: 'valuable', rarity: 'common', baseValue: 12, icon: '🪙' },
  { id: 'bottle', name: 'Statiegeldfles', category: 'valuable', rarity: 'common', baseValue: 8, icon: '🍾' },
  { id: 'scrap', name: 'Schroot', category: 'material', rarity: 'common', baseValue: 10, icon: '🔩' },
  { id: 'cardboard', name: 'Karton', category: 'material', rarity: 'common', baseValue: 6, icon: '📦' },
  { id: 'old_phone', name: 'Oude telefoon', category: 'valuable', rarity: 'common', baseValue: 18, icon: '📱' },
  { id: 'lamp', name: 'Vloerlamp', category: 'decor', rarity: 'common', baseValue: 20, incomePerHour: 28, flex: 1, icon: '🪔' },
  { id: 'plant', name: 'Kamerplant', category: 'decor', rarity: 'common', baseValue: 16, incomePerHour: 21, flex: 1, icon: '🪴' },
  { id: 'tyre', name: 'Autoband', category: 'part', rarity: 'common', baseValue: 22, icon: '🛞', districts: ['industrial', 'docks'] },

  // --- uncommon -----------------------------------------------------------
  { id: 'toolbox', name: 'Gereedschapskist', category: 'material', rarity: 'uncommon', baseValue: 34, icon: '🧰' },
  { id: 'copper', name: 'Koperdraad', category: 'material', rarity: 'uncommon', baseValue: 40, icon: '🧵', districts: ['industrial', 'docks'] },
  { id: 'sneakers', name: 'Limited sneakers', category: 'valuable', rarity: 'uncommon', baseValue: 55, flex: 3, icon: '👟', districts: ['downtown', 'nightlife'] },
  { id: 'speaker', name: 'Geluidsinstallatie', category: 'decor', rarity: 'uncommon', baseValue: 48, incomePerHour: 77, flex: 3, icon: '🔊', districts: ['nightlife'] },
  { id: 'armchair', name: 'Fauteuil', category: 'decor', rarity: 'uncommon', baseValue: 52, incomePerHour: 84, flex: 3, icon: '🛋️', districts: ['suburbs'] },
  { id: 'headlight', name: 'Koplampset', category: 'part', rarity: 'uncommon', baseValue: 46, icon: '💡', districts: ['industrial', 'suburbs'] },
  { id: 'season_chip', name: 'Seizoensfiche', category: 'token', rarity: 'uncommon', baseValue: 0, icon: '🎟️' },

  // --- rare ---------------------------------------------------------------
  { id: 'laptop', name: 'Zakelijke laptop', category: 'valuable', rarity: 'rare', baseValue: 90, icon: '💻', districts: ['downtown', 'airport'] },
  { id: 'watch', name: 'Designhorloge', category: 'valuable', rarity: 'rare', baseValue: 120, flex: 8, icon: '⌚', districts: ['downtown', 'marina'] },
  { id: 'turbo', name: 'Turbokit', category: 'part', rarity: 'rare', baseValue: 110, icon: '🌀', districts: ['industrial', 'docks'] },
  { id: 'aquarium', name: 'Aquarium', category: 'decor', rarity: 'rare', baseValue: 105, incomePerHour: 196, flex: 7, icon: '🐠' },
  { id: 'arcade', name: 'Arcadekast', category: 'decor', rarity: 'rare', baseValue: 130, incomePerHour: 238, flex: 9, icon: '🕹️', districts: ['nightlife', 'oldTown'] },
  { id: 'camera', name: 'Filmcamera', category: 'valuable', rarity: 'rare', baseValue: 95, flex: 5, icon: '🎥' },
  { id: 'crate', name: 'Verzegelde krat', category: 'material', rarity: 'rare', baseValue: 85, icon: '🗃️', districts: ['docks', 'airport'] },

  // --- epic ---------------------------------------------------------------
  { id: 'gold_bar', name: 'Goudstaaf', category: 'valuable', rarity: 'epic', baseValue: 320, flex: 14, icon: '🧈' },
  { id: 'painting', name: 'Schilderij', category: 'decor', rarity: 'epic', baseValue: 380, incomePerHour: 672, flex: 22, icon: '🖼️', districts: ['hills', 'marina'] },
  { id: 'piano', name: 'Vleugel', category: 'decor', rarity: 'epic', baseValue: 410, incomePerHour: 728, flex: 25, icon: '🎹', districts: ['hills'] },
  { id: 'engine_v8', name: 'V8-blok', category: 'part', rarity: 'epic', baseValue: 340, icon: '⚙️', districts: ['industrial', 'hills'] },
  { id: 'safe', name: 'Kluisje', category: 'valuable', rarity: 'epic', baseValue: 300, icon: '🔐', districts: ['downtown', 'airport'] },
  { id: 'jet_ski', name: 'Jetski', category: 'valuable', rarity: 'epic', baseValue: 450, flex: 20, icon: '🚤', districts: ['marina', 'docks'] },

  // --- legendary ----------------------------------------------------------
  { id: 'diamond', name: 'Ruwe diamant', category: 'valuable', rarity: 'legendary', baseValue: 1400, flex: 60, icon: '💎' },
  { id: 'sculpture', name: 'Bronzen sculptuur', category: 'decor', rarity: 'legendary', baseValue: 1600, incomePerHour: 2940, flex: 90, icon: '🗿', districts: ['hills', 'marina'] },
  { id: 'chandelier', name: 'Kroonluchter', category: 'decor', rarity: 'legendary', baseValue: 1500, incomePerHour: 2730, flex: 85, icon: '✨', districts: ['hills', 'island'] },
  { id: 'race_ecu', name: 'Race-ECU', category: 'part', rarity: 'legendary', baseValue: 1300, icon: '🧠', districts: ['hills', 'industrial'] },
  { id: 'season_key', name: 'Seizoenssleutel', category: 'token', rarity: 'legendary', baseValue: 0, icon: '🔑' },

  // --- alleen te craften ----------------------------------------------------
  { id: 'workbench', name: 'Werkbank', category: 'decor', rarity: 'uncommon', baseValue: 45, incomePerHour: 126, flex: 4, icon: '🪚', craftOnly: true },
  { id: 'neon_sign', name: 'Neonreclame', category: 'decor', rarity: 'rare', baseValue: 100, incomePerHour: 308, flex: 13, icon: '🪧', craftOnly: true },
  { id: 'home_gym', name: 'Thuisgym', category: 'decor', rarity: 'rare', baseValue: 118, incomePerHour: 364, flex: 15, icon: '🏋️', craftOnly: true },
  { id: 'race_sim', name: 'Racesimulator', category: 'decor', rarity: 'epic', baseValue: 395, incomePerHour: 826, flex: 30, icon: '🕹️', craftOnly: true },
  { id: 'art_wall', name: 'Kunstwand', category: 'decor', rarity: 'epic', baseValue: 420, incomePerHour: 882, flex: 34, icon: '🎨', craftOnly: true },
  { id: 'trophy_case', name: 'Prijzenkast', category: 'decor', rarity: 'legendary', baseValue: 1_650, incomePerHour: 3115, flex: 105, icon: '🏆', craftOnly: true },
  { id: 'private_vault', name: 'Privékluis', category: 'decor', rarity: 'legendary', baseValue: 1_800, incomePerHour: 3360, flex: 120, icon: '🔒', craftOnly: true },

  // --- mythic -------------------------------------------------------------
  { id: 'meteorite', name: 'Meteorietsplinter', category: 'valuable', rarity: 'mythic', baseValue: 6500, flex: 250, icon: '☄️' },
  { id: 'city_deed', name: 'Eigendomsakte', category: 'decor', rarity: 'mythic', baseValue: 9000, incomePerHour: 16800, flex: 400, icon: '📜', districts: ['island', 'hills'] },
  { id: 'crown', name: 'Kroon', category: 'cosmetic', rarity: 'mythic', baseValue: 7500, flex: 320, icon: '👑', districts: ['island'] },
] as const;

export const ITEMS_BY_ID: Readonly<Record<string, LootItemDef>> = Object.fromEntries(
  ITEMS.map((i) => [i.id, i]),
);

export function getItem(id: string): LootItemDef {
  const item = ITEMS_BY_ID[id];
  if (!item) throw new Error(`Onbekend item: ${id}`);
  return item;
}

export function itemsByRarity(rarity: Rarity): LootItemDef[] {
  return ITEMS.filter((i) => i.rarity === rarity);
}

export function itemsByCategory(category: ItemCategory): LootItemDef[] {
  return ITEMS.filter((i) => i.category === category);
}

/**
 * Kiest een item van een bepaalde zeldzaamheid dat in dit district kan vallen.
 * Items zonder `districts` kunnen overal vallen; items mét zijn gebonden aan
 * hun districten, wat elk stadsdeel een eigen loot-profiel geeft.
 */
export function pickItemForDistrict(
  districtId: DistrictId,
  rarity: Rarity,
  rand: number,
): LootItemDef | null {
  const pool = ITEMS.filter(
    (i) =>
      i.rarity === rarity &&
      !i.craftOnly &&
      (!i.districts || i.districts.includes(districtId)),
  );
  if (pool.length === 0) return null;
  const index = Math.min(pool.length - 1, Math.floor(rand * pool.length));
  return pool[index] ?? null;
}

/**
 * Verkoopwaarde van een item.
 *
 * `baseValue` ís de prijs: de zeldzaamheid zit er al in verwerkt (12 voor los
 * muntgeld, 1.400 voor een ruwe diamant). Er gaat bewust geen extra
 * zeldzaamheidsfactor overheen — dat verrekende het dubbel.
 */
export function sellValue(item: ItemDef, marketMultiplier = 1): number {
  return Math.round(item.baseValue * marketMultiplier);
}

/**
 * De marktprijs schommelt per dag per categorie tussen 0,85x en 1,25x.
 * Deterministisch, zodat client en server dezelfde prijs tonen.
 */
export function marketMultiplier(category: ItemCategory, dayIndex: number): number {
  const seedValues = [dayIndex, category.length, category.charCodeAt(0)];
  let h = 2166136261 >>> 0;
  for (const v of seedValues) {
    h ^= Math.imul(v | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 13), 0x85ebca6b);
    h = (h ^ (h >>> 16)) >>> 0;
  }
  const r = (h >>> 0) / 4294967296;
  return Math.round((0.85 + r * 0.4) * 100) / 100;
}

/** Aantal hele dagen sinds epoch — de eenheid waarin de markt beweegt. */
export function dayIndexFor(timestampMs: number): number {
  return Math.floor(timestampMs / 86_400_000);
}
