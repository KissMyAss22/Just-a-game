/**
 * Woningen = je base. Elke tier bepaalt hoeveel je passief verdient, hoe groot
 * je kluis is en hoe lang je offline inkomen doorloopt.
 *
 * Hoeveel er ín past staat hier bewust niet: dat volgt uit de plattegrond in
 * `home.ts` (`propertySlots()`). Twee plekken die allebei de capaciteit
 * bepalen zouden vroeg of laat uit elkaar gaan lopen.
 */
export interface PropertyDef {
  id: string;
  name: string;
  tier: number;
  /** Aankoopprijs in cash. 0 = startwoning. */
  price: number;
  /** Passief inkomen per uur uit de woning zelf. */
  incomePerHour: number;
  /** Maximum dat zich in je kluis kan ophopen voordat het overloopt. */
  vaultCapacity: number;
  /** Hoeveel uur offline inkomen wordt meegerekend. */
  offlineCapHours: number;
  /** Bijdrage aan je Flex Score. */
  flex: number;
  requiredLevel: number;
  icon: string;
}

export const PROPERTIES: readonly PropertyDef[] = [
  { id: 'squat', name: 'Kraakpand', tier: 0, price: 0, incomePerHour: 35, vaultCapacity: 2_800, offlineCapHours: 4, flex: 0, requiredLevel: 1, icon: '🏚️' },
  { id: 'studio', name: 'Studio', tier: 1, price: 2_500, incomePerHour: 154, vaultCapacity: 12_600, offlineCapHours: 6, flex: 5, requiredLevel: 3, icon: '🏠' },
  { id: 'apartment', name: 'Appartement', tier: 2, price: 12_000, incomePerHour: 595, vaultCapacity: 49_000, offlineCapHours: 8, flex: 15, requiredLevel: 6, icon: '🏢' },
  { id: 'townhouse', name: 'Rijtjeshuis', tier: 3, price: 55_000, incomePerHour: 2_380, vaultCapacity: 196_000, offlineCapHours: 10, flex: 40, requiredLevel: 12, icon: '🏡' },
  { id: 'loft', name: 'Loft', tier: 4, price: 240_000, incomePerHour: 7_350, vaultCapacity: 770_000, offlineCapHours: 12, flex: 90, requiredLevel: 18, icon: '🏬' },
  { id: 'villa', name: 'Villa', tier: 5, price: 1_100_000, incomePerHour: 35_600, vaultCapacity: 3_360_000, offlineCapHours: 14, flex: 200, requiredLevel: 26, icon: '🏘️' },
  { id: 'penthouse', name: 'Penthouse', tier: 6, price: 5_200_000, incomePerHour: 168_000, vaultCapacity: 14_700_000, offlineCapHours: 16, flex: 450, requiredLevel: 34, icon: '🌆' },
  { id: 'mansion', name: 'Landhuis', tier: 7, price: 26_000_000, incomePerHour: 756_000, vaultCapacity: 66_500_000, offlineCapHours: 20, flex: 950, requiredLevel: 44, icon: '🏰' },
  { id: 'island_estate', name: 'Privé-eiland', tier: 8, price: 150_000_000, incomePerHour: 3_920_000, vaultCapacity: 350_000_000, offlineCapHours: 24, flex: 2_400, requiredLevel: 60, icon: '🏝️' },
] as const;

export const PROPERTIES_BY_ID: Readonly<Record<string, PropertyDef>> = Object.fromEntries(
  PROPERTIES.map((p) => [p.id, p]),
);

export const STARTER_PROPERTY_ID = 'squat';

export function getProperty(id: string): PropertyDef {
  const p = PROPERTIES_BY_ID[id];
  if (!p) throw new Error(`Onbekende woning: ${id}`);
  return p;
}

/** De eerstvolgende woning die je kunt kopen. */
export function nextProperty(currentId: string): PropertyDef | null {
  const current = getProperty(currentId);
  return PROPERTIES.find((p) => p.tier === current.tier + 1) ?? null;
}
