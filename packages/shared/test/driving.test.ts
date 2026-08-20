import { describe, expect, it } from 'vitest';
import { CITY, cellToWorld } from '../src/city/layout';
import { ECONOMY, computeStats } from '../src/economy';
import { driveStep, toKmh, vehicleRadius, type DriveState } from '../src/driving';
import { getVehicle } from '../src/vehicles';

const sedan = getVehicle('sedan');
/**
 * Startpunt op een kruising, uitgerekend uit de stadsdata in plaats van
 * ingetypt: waar de straten liggen hangt af van de bloklengte, en die kan
 * veranderen.
 */
const kruising = cellToWorld(CITY.blockSize * 13, CITY.blockSize * 13);
const stopped: DriveState = { x: kruising.x, z: kruising.z, heading: 0, speed: 0 };
const TOP = ECONOMY.baseMoveSpeed * sedan.speedMultiplier;

/** Laat een aantal stappen rijden en geeft de eindstand terug. */
function drive(
  state: DriveState,
  throttle: number,
  steer: number,
  seconds: number,
  step = 1 / 60,
): DriveState {
  let current = state;
  for (let t = 0; t < seconds; t += step) {
    current = driveStep(current, { throttle, steer }, sedan, TOP, step);
  }
  return current;
}

describe('rijden', () => {
  it('trekt op naar de topsnelheid en gaat er niet overheen', () => {
    const after1s = drive(stopped, 1, 0, 1);
    expect(after1s.speed).toBeGreaterThan(sedan.acceleration * 0.8);

    const flatOut = drive(stopped, 1, 0, 10);
    expect(flatOut.speed).toBeCloseTo(TOP, 5);
    expect(flatOut.speed).toBeLessThanOrEqual(TOP);
  });

  it('rijdt achteruit veel langzamer dan vooruit', () => {
    const reversing = drive(stopped, -1, 0, 10);
    expect(reversing.speed).toBeLessThan(0);
    expect(Math.abs(reversing.speed)).toBeLessThan(TOP * 0.4);
  });

  it('remt sneller af dan het optrekt', () => {
    const rolling = drive(stopped, 1, 0, 8);
    const coasting = drive(rolling, 0, 0, 1);
    const braking = drive(rolling, -1, 0, 1);
    // Remmen haalt er meer snelheid af dan alleen van het gas gaan.
    expect(rolling.speed - braking.speed).toBeGreaterThan(rolling.speed - coasting.speed);
  });

  it('rolt uit tot stilstand en niet verder', () => {
    const rolling = drive(stopped, 1, 0, 5);
    const stoppedAgain = drive(rolling, 0, 0, 60);
    expect(stoppedAgain.speed).toBe(0);
  });

  it('stuurt niet als je stilstaat', () => {
    const turned = drive(stopped, 0, 1, 2);
    expect(turned.heading).toBe(0);
    expect(turned.x).toBe(stopped.x);
    expect(turned.z).toBe(stopped.z);
  });

  it('stuurt omgekeerd als je achteruit rijdt', () => {
    const forward = drive(stopped, 1, 1, 2);
    const backward = drive(stopped, -1, 1, 2);
    expect(forward.heading).toBeGreaterThan(0);
    expect(backward.heading).toBeLessThan(0);
  });

  it('stuurt rustiger naarmate je harder rijdt', () => {
    const slow = driveStep({ ...stopped, speed: 5 }, { throttle: 0, steer: 1 }, sedan, TOP, 0.1);
    const fast = driveStep({ ...stopped, speed: TOP }, { throttle: 0, steer: 1 }, sedan, TOP, 0.1);
    expect(Math.abs(fast.heading)).toBeLessThan(Math.abs(slow.heading));
  });

  it('kost vaart als je ergens tegenaan rijdt', () => {
    // Vanuit het midden van een bouwblok is er in elke richting binnen een
    // paar meter een gevel.
    const inside = cellToWorld(66, 66);
    const start: DriveState = { x: inside.x, z: inside.z, heading: 0, speed: TOP };
    let current = start;
    let hit = false;
    for (let heading = 0; heading < Math.PI * 2 && !hit; heading += Math.PI / 8) {
      current = { ...start, heading };
      for (let t = 0; t < 3; t += 1 / 60) {
        const next = driveStep(current, { throttle: 1, steer: 0 }, sedan, TOP, 1 / 60);
        if (next.speed < current.speed * 0.5) {
          hit = true;
          current = next;
          break;
        }
        current = next;
      }
    }
    expect(hit).toBe(true);
    expect(current.speed).toBeLessThan(TOP * 0.5);
  });

  it('is een zuivere functie: dezelfde invoer geeft dezelfde uitvoer', () => {
    const a = driveStep(stopped, { throttle: 1, steer: 0.5 }, sedan, TOP, 0.1);
    const b = driveStep(stopped, { throttle: 1, steer: 0.5 }, sedan, TOP, 0.1);
    expect(a).toEqual(b);
    // En de invoer blijft ongemoeid.
    expect(stopped.speed).toBe(0);
  });

  it('houdt de botsingsstraal binnen de breedte van het voertuig', () => {
    for (const vehicle of [getVehicle('scooter'), sedan, getVehicle('van')]) {
      expect(vehicleRadius(vehicle)).toBeLessThan(vehicle.body[1]);
      expect(vehicleRadius(vehicle)).toBeGreaterThan(0);
    }
  });

  it('rekent de teller om naar hele kilometers per uur', () => {
    expect(toKmh(10)).toBe(36);
    expect(toKmh(-10)).toBe(36);
    expect(toKmh(0)).toBe(0);
  });
});

describe('loop- en rijsnelheid', () => {
  const base = { propertyId: 'squat', upgrades: {}, placements: [] };

  it('geeft de vermenigvuldiger van een auto pas als je erin stapt', () => {
    const stats = computeStats({ ...base, vehicleId: 'sedan' });
    expect(stats.moveSpeed).toBeCloseTo(ECONOMY.baseMoveSpeed * sedan.speedMultiplier);
    // Te voet loop je gewoon je basistempo: de auto helpt pas achter het stuur.
    expect(stats.walkSpeed).toBeCloseTo(ECONOMY.baseMoveSpeed);
  });

  it('laat een boot wel je looptempo verhogen, want varen kan nog niet', () => {
    const boat = getVehicle('boat');
    const stats = computeStats({ ...base, vehicleId: 'boat' });
    expect(stats.walkSpeed).toBeCloseTo(ECONOMY.baseMoveSpeed * boat.speedMultiplier);
    expect(stats.walkSpeed).toBeCloseTo(stats.moveSpeed);
  });

  it('houdt de looptempo nooit boven de snelheid waarop de server toetst', () => {
    for (const id of ['on_foot', 'scooter', 'hatchback', 'sedan', 'boat', 'helicopter']) {
      const stats = computeStats({ ...base, vehicleId: id });
      expect(stats.walkSpeed).toBeLessThanOrEqual(stats.moveSpeed + 1e-9);
    }
  });
});
