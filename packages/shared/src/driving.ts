import { resolveMovement } from './city/layout';
import type { VehicleDef } from './vehicles';

/**
 * Hoe een voertuig rijdt.
 *
 * Dit staat in `shared` en niet in de app, om dezelfde reden als de
 * stadslayout: de server moet kunnen narekenen of een gemelde positie kán
 * kloppen. Een auto haalt makkelijk vier keer je looptempo, en zonder dat de
 * server dat weet is "ik reed" niet te onderscheiden van "ik sprong".
 *
 * Het model is bewust arcade en geen simulatie: gas, rem, sturen. Wat het wél
 * doet is de dingen die je meteen voelt als ze ontbreken — je kunt niet
 * stilstaand ronddraaien, sturen wordt rustiger naarmate je harder rijdt,
 * achteruit stuur je omgekeerd, en tegen een muur rijden kost je vaart.
 */

export interface DriveState {
  x: number;
  z: number;
  /** Waar de neus heen wijst, in radialen. Dezelfde as als rotation.y. */
  heading: number;
  /** Meter per seconde; negatief is achteruit. */
  speed: number;
}

export interface DriveInput {
  /** 1 is vol gas, -1 is remmen of achteruit. */
  throttle: number;
  /** -1 is links, 1 is rechts. */
  steer: number;
}

/** Deel van de topsnelheid dat je achteruit haalt. */
const REVERSE_SHARE = 0.32;
/** Remmen mag harder dan optrekken; anders voelt een auto als een boot. */
const BRAKE_FACTOR = 2.2;
/** Motorrem als je van het gas gaat. */
const COAST_FACTOR = 0.55;
/** Onder deze snelheid stuur je niet: een auto draait niet om zijn as. */
const STEER_GRIP_SPEED = 3.5;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** De straal waarmee een voertuig tegen gebouwen botst. */
export function vehicleRadius(vehicle: VehicleDef): number {
  return Math.max(0.55, vehicle.body[1] * 0.45);
}

/**
 * Eén stap rijden.
 *
 * `topSpeed` komt van buiten en niet uit de definitie, omdat er nog perks en
 * boosts overheen kunnen. De server gebruikt dezelfde waarde als plafond.
 */
export function driveStep(
  state: DriveState,
  input: DriveInput,
  vehicle: VehicleDef,
  topSpeed: number,
  delta: number,
): DriveState {
  const throttle = clamp(input.throttle, -1, 1);
  const steer = clamp(input.steer, -1, 1);
  const reverseTop = topSpeed * REVERSE_SHARE;

  let speed = state.speed;
  if (throttle > 0.02) {
    // Vooruit trekken, of afremmen als je nog achteruit rolt.
    const power = speed < 0 ? vehicle.acceleration * BRAKE_FACTOR : vehicle.acceleration;
    speed += power * throttle * delta;
  } else if (throttle < -0.02) {
    const power =
      speed > 0 ? vehicle.acceleration * BRAKE_FACTOR : vehicle.acceleration * 0.6;
    speed += power * throttle * delta;
  } else {
    const drag = vehicle.acceleration * COAST_FACTOR * delta;
    speed = speed > 0 ? Math.max(0, speed - drag) : Math.min(0, speed + drag);
  }
  speed = clamp(speed, -reverseTop, topSpeed);

  // Sturen heeft vaart nodig, en wordt rustiger naarmate je harder gaat.
  const grip = Math.min(1, Math.abs(speed) / STEER_GRIP_SPEED);
  const calm = 1 / (1 + (Math.abs(speed) / Math.max(topSpeed, 0.001)) * 1.4);
  const direction = speed < 0 ? -1 : 1;
  const heading = state.heading + steer * vehicle.turnRate * grip * calm * direction * delta;

  const wantedX = state.x + Math.sin(heading) * speed * delta;
  const wantedZ = state.z + Math.cos(heading) * speed * delta;
  const radius = vehicleRadius(vehicle);
  const moved = resolveMovement(state.x, state.z, wantedX, wantedZ, radius);

  // Tegen een muur rijden kost vaart. Zonder dit blijf je met vol gas langs
  // een gevel schuren alsof er niets aan de hand is.
  const wanted = Math.hypot(wantedX - state.x, wantedZ - state.z);
  const actual = Math.hypot(moved.x - state.x, moved.z - state.z);
  if (wanted > 0.0005 && actual < wanted * 0.55) {
    speed *= 0.25;
  }

  return { x: moved.x, z: moved.z, heading, speed };
}

/** Snelheid in km/u, voor de teller op het scherm. */
export function toKmh(speed: number): number {
  return Math.round(Math.abs(speed) * 3.6);
}
