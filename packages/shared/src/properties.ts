/**
 * Woningen = je base. Elke tier bepaalt hoeveel je passief verdient, hoeveel
 * items je kunt plaatsen, hoe groot je kluis is en hoe lang je offline
 * inkomen doorloopt.
 */
export interface PropertyDef {
  id: string;
  name: string;
  tier: number;
  /** Aankoopprijs in cash. 0 = startwoning. */
  price: number;
  /** Passief inkomen per uur uit de woning zelf. */
  incomePerHour: number;
  /** Aantal items dat je in je base kunt plaatsen. */
  slots: number;
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
  { id: 'squat', name: 'Kraakpand', tier: 0, price: 0, incomePerHour: 5, slots: 3, vaultCapacity: 400, offlineCapHours: 4, flex: 0, requiredLevel: 1, icon: '🏚️' },
  { id: 'studio', name: 'Studio', tier: 1, price: 2_500, incomePerHour: 22, slots: 5, vaultCapacity: 1_800, offlineCapHours: 6, flex: 5, requiredLevel: 3, icon: '🏠' },
  { id: 'apartment', name: 'Appartement', tier: 2, price: 12_000, incomePerHour: 85, slots: 8, vaultCapacity: 7_000, offlineCapHours: 8, flex: 15, requiredLevel: 6, icon: '🏢' },
  { id: 'townhouse', name: 'Rijtjeshuis', tier: 3, price: 55_000, incomePerHour: 340, slots: 12, vaultCapacity: 28_000, offlineCapHours: 10, flex: 40, requiredLevel: 12, icon: '🏡' },
  { id: 'loft', name: 'Loft', tier: 4, price: 240_000, incomePerHour: 1_350, slots: 16, vaultCapacity: 110_000, offlineCapHours: 12, flex: 90, requiredLevel: 18, icon: '🏬' },
  { id: 'villa', name: 'Villa', tier: 5, price: 1_100_000, incomePerHour: 5_600, slots: 22, vaultCapacity: 480_000, offlineCapHours: 14, flex: 200, requiredLevel: 26, icon: '🏘️' },
  { id: 'penthouse', name: 'Penthouse', tier: 6, price: 5_200_000, incomePerHour: 24_000, slots: 28, vaultCapacity: 2_100_000, offlineCapHours: 16, flex: 450, requiredLevel: 34, icon: '🌆' },
  { id: 'mansion', name: 'Landhuis', tier: 7, price: 26_000_000, incomePerHour: 108_000, slots: 36, vaultCapacity: 9_500_000, offlineCapHours: 20, flex: 950, requiredLevel: 44, icon: '🏰' },
  { id: 'island_estate', name: 'Privé-eiland', tier: 8, price: 150_000_000, incomePerHour: 560_000, slots: 48, vaultCapacity: 50_000_000, offlineCapHours: 24, flex: 2_400, requiredLevel: 60, icon: '🏝️' },
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
