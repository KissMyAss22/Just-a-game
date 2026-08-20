import { getVehicle, isWalkable, vehicleRadius } from '@game/shared';
import { create } from 'zustand';
import { driveState, playerPosition } from './position';

/**
 * In- en uitstappen.
 *
 * Alleen het feit "zit je in je voertuig" staat in React-state, omdat de knop
 * in de HUD moet meeveranderen. De stand van de auto zelf leeft buiten React
 * (zie `position.ts`): die verandert elke frame, en daar wil je geen
 * hertekeningen voor.
 *
 * Dit bestand raakt bewust geen three aan, zodat de HUD er niet de hele
 * 3D-laag bij hoeft te halen om een knop te kunnen tekenen.
 */

const PLAYER_RADIUS = 0.5;
/** Verder dan dit van je voertuig, en het komt naar je toe. */
const REACH_TO_VEHICLE = 8;

interface DrivingState {
  active: boolean;
  setActive: (active: boolean) => void;
}

export const useDriving = create<DrivingState>((set) => ({
  active: false,
  setActive: (active) => set({ active }),
}));

/**
 * Zet het voertuig netjes naast de speler, op een plek waar het past, en
 * onthoudt die plek: daar blijft hij staan zolang je te voet bent.
 */
export function parkBeside(x: number, z: number, heading: number): void {
  const right = heading + Math.PI / 2;
  for (const offset of [3.0, -3.0, 4.5, -4.5]) {
    const spotX = x + Math.sin(right) * offset;
    const spotZ = z + Math.cos(right) * offset;
    if (isWalkable(spotX, spotZ, 1.2)) {
      driveState.x = spotX;
      driveState.z = spotZ;
      driveState.heading = heading;
      return;
    }
  }
  driveState.x = x;
  driveState.z = z;
  driveState.heading = heading;
}

export const driving = {
  /**
   * Stap in. Staat je voertuig te ver weg, dan komt het naar je toe — je auto
   * kwijtraken in een stad van een vierkante kilometer is geen leuke
   * spelmechaniek, alleen een vervelende.
   */
  enter(vehicleId: string): void {
    const def = getVehicle(vehicleId);
    if (!def.drivable) return;

    const distance = Math.hypot(driveState.x - playerPosition.x, driveState.z - playerPosition.z);
    if (distance > REACH_TO_VEHICLE || !isWalkable(driveState.x, driveState.z, vehicleRadius(def))) {
      driveState.x = playerPosition.x;
      driveState.z = playerPosition.z;
    } else {
      // Je stapt in waar hij staat, dus daar sta jij ook.
      playerPosition.x = driveState.x;
      playerPosition.z = driveState.z;
    }
    driveState.speed = 0;
    useDriving.getState().setActive(true);
  },

  /** Stap uit naast de auto, of erachter als daar geen plek is. */
  exit(): void {
    const heading = driveState.heading;
    const left = heading - Math.PI / 2;
    const spots: [number, number][] = [
      [Math.sin(left) * 2.2, Math.cos(left) * 2.2],
      [-Math.sin(left) * 2.2, -Math.cos(left) * 2.2],
      [-Math.sin(heading) * 3.4, -Math.cos(heading) * 3.4],
    ];
    for (const [dx, dz] of spots) {
      const x = driveState.x + dx;
      const z = driveState.z + dz;
      if (isWalkable(x, z, PLAYER_RADIUS)) {
        playerPosition.x = x;
        playerPosition.z = z;
        break;
      }
    }
    driveState.speed = 0;
    useDriving.getState().setActive(false);
  },
};
