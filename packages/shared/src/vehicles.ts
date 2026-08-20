import type { DistrictId } from './city/districts';

/**
 * Voertuigen zijn geen cosmetica: ze bepalen hoe snel je door de stad komt,
 * hoeveel je kunt dragen en welke districten je kunt bereiken. In een
 * wegvoertuig stap je ook echt in en rijd je zelf.
 */

/**
 * Waar een voertuig zich voortbeweegt. Alleen `weg` is op dit moment te
 * besturen; boten en de helikopter hebben water- en luchtbeweging nodig en
 * geven zolang nog een bonus op je looptempo.
 */
export type VehicleKind = 'te_voet' | 'weg' | 'water' | 'lucht';

export interface VehicleDef {
  id: string;
  name: string;
  tier: number;
  price: number;
  kind: VehicleKind;
  /** Kun je erin stappen en zelf rijden? */
  drivable: boolean;
  /** Optrekken in meter per seconde per seconde. */
  acceleration: number;
  /** Hoe snel de neus draait bij vol stuur, in radialen per seconde. */
  turnRate: number;
  /** Afmetingen van de carrosserie in meters: lengte, breedte, hoogte. */
  body: readonly [number, number, number];
  /** Vermenigvuldiger op je snelheid. Bij een bestuurbaar voertuig is dat de
   *  topsnelheid waarmee je rijdt; bij de rest je looptempo. */
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
  { id: 'on_foot', name: 'Te voet', tier: 0, price: 0, kind: 'te_voet', drivable: false, acceleration: 0, turnRate: 0, body: [0.5, 0.5, 1.8], speedMultiplier: 1, carryBonus: 0, flex: 0, requiredLevel: 1, icon: '🚶' },
  { id: 'scooter', name: 'Scooter', tier: 1, price: 3_500, kind: 'weg', drivable: true, acceleration: 4.2, turnRate: 2.6, body: [1.95, 0.72, 1.15], speedMultiplier: 1.6, carryBonus: 2, flex: 4, requiredLevel: 4, icon: '🛵' },
  { id: 'hatchback', name: 'Hatchback', tier: 2, price: 18_000, kind: 'weg', drivable: true, acceleration: 5.2, turnRate: 2.0, body: [3.95, 1.76, 1.50], speedMultiplier: 2.1, carryBonus: 6, flex: 12, requiredLevel: 8, icon: '🚗' },
  { id: 'van', name: 'Bestelbus', tier: 3, price: 46_000, kind: 'weg', drivable: true, acceleration: 4.0, turnRate: 1.55, body: [5.20, 2.00, 2.25], speedMultiplier: 1.9, carryBonus: 18, flex: 10, requiredLevel: 12, icon: '🚐' },
  { id: 'sedan', name: 'Sedan', tier: 4, price: 130_000, kind: 'weg', drivable: true, acceleration: 6.6, turnRate: 1.9, body: [4.80, 1.86, 1.44], speedMultiplier: 2.6, carryBonus: 10, flex: 45, requiredLevel: 16, icon: '🚙' },
  { id: 'sportscar', name: 'Sportwagen', tier: 5, price: 700_000, kind: 'weg', drivable: true, acceleration: 9.0, turnRate: 2.2, body: [4.35, 1.94, 1.16], speedMultiplier: 3.3, carryBonus: 8, flex: 140, requiredLevel: 22, icon: '🏎️' },
  { id: 'boat', name: 'Speedboot', tier: 6, price: 1_900_000, kind: 'water', drivable: false, acceleration: 3.4, turnRate: 1.2, body: [6.20, 2.20, 1.60], speedMultiplier: 2.8, carryBonus: 14, flex: 210, requiredLevel: 28, unlocksDistricts: ['island'], icon: '🚤' },
  { id: 'supercar', name: 'Supercar', tier: 7, price: 6_800_000, kind: 'weg', drivable: true, acceleration: 12.0, turnRate: 2.3, body: [4.60, 2.02, 1.10], speedMultiplier: 4.1, carryBonus: 10, flex: 600, requiredLevel: 36, icon: '🚘' },
  { id: 'helicopter', name: 'Helikopter', tier: 8, price: 34_000_000, kind: 'lucht', drivable: false, acceleration: 5.0, turnRate: 1.4, body: [9.50, 2.60, 3.20], speedMultiplier: 5.5, carryBonus: 22, flex: 1_500, requiredLevel: 46, unlocksDistricts: ['airport', 'island'], icon: '🚁' },
  { id: 'yacht', name: 'Superjacht', tier: 9, price: 210_000_000, kind: 'water', drivable: false, acceleration: 1.8, turnRate: 0.5, body: [22.0, 6.0, 6.5], speedMultiplier: 3, carryBonus: 60, flex: 5_000, requiredLevel: 62, unlocksDistricts: ['island', 'marina'], icon: '🛥️' },
] as const;

export const VEHICLES_BY_ID: Readonly<Record<string, VehicleDef>> = Object.fromEntries(
  VEHICLES.map((v) => [v.id, v]),
);

export const STARTER_VEHICLE_ID = 'on_foot';

/** De voertuigen waar je daadwerkelijk in kunt stappen. */
export const DRIVABLE_VEHICLES = VEHICLES.filter((v) => v.drivable);

export function getVehicle(id: string): VehicleDef {
  const v = VEHICLES_BY_ID[id];
  if (!v) throw new Error(`Onbekend voertuig: ${id}`);
  return v;
}
