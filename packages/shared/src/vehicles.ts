import type { DistrictId } from './city/districts';

/**
 * Voertuigen zijn geen cosmetica: ze bepalen hoe snel je door de stad komt,
 * hoeveel je kunt dragen en welke districten je kunt bereiken.
 */
export interface VehicleDef {
  id: string;
  name: string;
  tier: number;
  price: number;
  /** Vermenigvuldiger op loopsnelheid. */
  speedMultiplier: number;
  /** Extra inventarisplekken. */
  carryBonus: number;
  flex: number;
  requiredLevel: number;
  /** Districten die pas met dit voertuig bereikbaar zijn. */
  unlocksDistricts?: readonly DistrictId[];
  icon: string;
}

export const VEHICLES: readonly VehicleDef[] = [
  { id: 'on_foot', name: 'Te voet', tier: 0, price: 0, speedMultiplier: 1, carryBonus: 0, flex: 0, requiredLevel: 1, icon: '🚶' },
  { id: 'scooter', name: 'Scooter', tier: 1, price: 3_500, speedMultiplier: 1.6, carryBonus: 2, flex: 4, requiredLevel: 4, icon: '🛵' },
  { id: 'hatchback', name: 'Hatchback', tier: 2, price: 18_000, speedMultiplier: 2.1, carryBonus: 6, flex: 12, requiredLevel: 8, icon: '🚗' },
  { id: 'van', name: 'Bestelbus', tier: 3, price: 46_000, speedMultiplier: 1.9, carryBonus: 18, flex: 10, requiredLevel: 12, icon: '🚐' },
  { id: 'sedan', name: 'Sedan', tier: 4, price: 130_000, speedMultiplier: 2.6, carryBonus: 10, flex: 45, requiredLevel: 16, icon: '🚙' },
  { id: 'sportscar', name: 'Sportwagen', tier: 5, price: 700_000, speedMultiplier: 3.3, carryBonus: 8, flex: 140, requiredLevel: 22, icon: '🏎️' },
  { id: 'boat', name: 'Speedboot', tier: 6, price: 1_900_000, speedMultiplier: 2.8, carryBonus: 14, flex: 210, requiredLevel: 28, unlocksDistricts: ['island'], icon: '🚤' },
  { id: 'supercar', name: 'Supercar', tier: 7, price: 6_800_000, speedMultiplier: 4.1, carryBonus: 10, flex: 600, requiredLevel: 36, icon: '🚘' },
  { id: 'helicopter', name: 'Helikopter', tier: 8, price: 34_000_000, speedMultiplier: 5.5, carryBonus: 22, flex: 1_500, requiredLevel: 46, unlocksDistricts: ['airport', 'island'], icon: '🚁' },
  { id: 'yacht', name: 'Superjacht', tier: 9, price: 210_000_000, speedMultiplier: 3, carryBonus: 60, flex: 5_000, requiredLevel: 62, unlocksDistricts: ['island', 'marina'], icon: '🛥️' },
] as const;

export const VEHICLES_BY_ID: Readonly<Record<string, VehicleDef>> = Object.fromEntries(
  VEHICLES.map((v) => [v.id, v]),
);

export const STARTER_VEHICLE_ID = 'on_foot';

export function getVehicle(id: string): VehicleDef {
  const v = VEHICLES_BY_ID[id];
  if (!v) throw new Error(`Onbekend voertuig: ${id}`);
  return v;
}
