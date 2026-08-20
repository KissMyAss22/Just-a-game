import { groundHeightAt, type VehicleDef } from '@game/shared';
import * as THREE from 'three';
import { mergeParts, standingBox, type Part } from './geometry';

/**
 * Het voertuig waar je zelf in rijdt.
 *
 * Anders dan de geparkeerde auto's langs de weg is dit geen vaste geometrie:
 * de wielen draaien mee met je snelheid, de voorwielen sturen, de remlichten
 * gaan aan als je remt en de koplampen branden in het donker. Dat zijn precies
 * de dingen die je mist zodra ze er niet zijn — zonder draaiende wielen glijdt
 * een auto over straat in plaats van te rijden.
 *
 * De carrosserie wordt wit gebakken zodat de lakkleur er als tint overheen kan.
 */

const WHEEL_SEGMENTS = 14;

interface BodySpec {
  /** Lengte, breedte, hoogte in meters. */
  length: number;
  width: number;
  height: number;
  wheelRadius: number;
  /** Waar de assen zitten, gemeten vanaf het midden. */
  axle: number;
  twoWheeler: boolean;
}

function specFor(vehicle: VehicleDef): BodySpec {
  const [length, width, height] = vehicle.body;
  const twoWheeler = width < 1.1;
  return {
    length,
    width,
    height,
    wheelRadius: twoWheeler ? 0.32 : Math.min(0.40, height * 0.26),
    axle: length * 0.31,
    twoWheeler,
  };
}

const PAINT = '#ffffff';
const GLASS = '#0c1219';
const TRIM = '#1b1e22';

/** Carrosserie van een auto: bak, motorkap, kofferbak en cabine. */
function carBodyParts(spec: BodySpec): Part[] {
  const { length, width, height } = spec;
  // Een auto is vooral onderbouw met een bescheiden kap erop. Draai je die
  // verhouding om, dan krijg je een bestelbus — ook als hij sedan heet.
  const sill = spec.wheelRadius * 0.55;
  const bodyHeight = (height - sill) * 0.62;
  const cabinHeight = height - sill - bodyHeight;
  const cabinLength = length * 0.42;
  const cabinShift = -length * 0.07;

  return [
    // Onderbouw, met dorpels die iets smaller zijn dan de gordellijn.
    { geometry: standingBox(length * 0.99, bodyHeight * 0.55, width * 0.93), color: PAINT, position: [0, sill, 0] },
    {
      geometry: standingBox(length, bodyHeight * 0.55, width),
      color: PAINT,
      position: [0, sill + bodyHeight * 0.5, 0],
    },
    // Gordellijn: een donkere strip waar de ruiten beginnen.
    {
      geometry: standingBox(length * 0.995, 0.05, width * 1.005),
      color: TRIM,
      position: [0, sill + bodyHeight - 0.05, 0],
    },
    // Kap, met ruiten die er net buiten steken zodat de stijlen blijven staan.
    {
      geometry: standingBox(cabinLength, cabinHeight, width * 0.86),
      color: PAINT,
      position: [cabinShift, sill + bodyHeight, 0],
    },
    {
      geometry: standingBox(cabinLength * 0.90, cabinHeight * 0.74, width * 0.90),
      color: GLASS,
      position: [cabinShift, sill + bodyHeight + cabinHeight * 0.13, 0],
    },
    // Voor- en achterruit lopen schuin weg van de kap.
    {
      geometry: standingBox(length * 0.16, cabinHeight * 0.66, width * 0.80),
      color: GLASS,
      position: [cabinShift + cabinLength * 0.52, sill + bodyHeight + cabinHeight * 0.14, 0],
      rotation: [0, 0, -0.42],
    },
    {
      geometry: standingBox(length * 0.13, cabinHeight * 0.62, width * 0.78),
      color: GLASS,
      position: [cabinShift - cabinLength * 0.52, sill + bodyHeight + cabinHeight * 0.16, 0],
      rotation: [0, 0, 0.40],
    },
    // Bumpers.
    {
      geometry: standingBox(length * 0.05, bodyHeight * 0.45, width * 0.97),
      color: TRIM,
      position: [length * 0.48, sill * 0.7, 0],
    },
    {
      geometry: standingBox(length * 0.05, bodyHeight * 0.45, width * 0.97),
      color: TRIM,
      position: [-length * 0.48, sill * 0.7, 0],
    },
  ];
}

/** Een scooter: frame, zadel, stuur en spatborden. */
function scooterBodyParts(spec: BodySpec): Part[] {
  const { length, width } = spec;
  return [
    // Treeplank en middenframe.
    { geometry: standingBox(length * 0.42, 0.09, width * 0.95), color: TRIM, position: [-length * 0.02, 0.28, 0] },
    { geometry: standingBox(length * 0.46, 0.30, width * 0.78), color: PAINT, position: [-length * 0.16, 0.36, 0] },
    // Zadel.
    { geometry: standingBox(length * 0.34, 0.11, width * 0.85), color: TRIM, position: [-length * 0.18, 0.66, 0] },
    // Voorscherm met stuur en spiegels.
    { geometry: standingBox(0.22, 0.62, width * 0.85), color: PAINT, position: [length * 0.28, 0.34, 0] },
    { geometry: standingBox(0.14, 0.26, width * 0.7), color: PAINT, position: [length * 0.30, 0.96, 0] },
    { geometry: standingBox(0.08, 0.08, width * 1.7), color: TRIM, position: [length * 0.28, 1.02, 0] },
    // Spatbord voor.
    { geometry: standingBox(0.46, 0.08, width * 0.6), color: PAINT, position: [length * 0.31, 0.52, 0] },
  ];
}

export interface Vehicle {
  group: THREE.Group;
  /** Waar de bestuurder zit, in de ruimte van het voertuig. */
  seat: THREE.Vector3;
  /**
   * Elke frame: `speed` in meter per seconde (negatief is achteruit),
   * `steer` -1..1, `braking` of er geremd wordt, `night` 0..1.
   */
  update: (delta: number, speed: number, steer: number, braking: boolean, night: number) => void;
  /** Zet het voertuig op de grond op deze plek. */
  place: (x: number, z: number, heading: number) => void;
  dispose: () => void;
}

export function createVehicle(vehicle: VehicleDef, paint: string, castShadow = true): Vehicle {
  const spec = specFor(vehicle);
  const group = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.22,
    metalness: 0.55,
  });
  const tint = new THREE.Color(paint);

  const parts = spec.twoWheeler ? scooterBodyParts(spec) : carBodyParts(spec);
  const bodyGeometry = mergeParts(parts);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.castShadow = castShadow;
  // De lak zit in de instance-kleur bij geparkeerde auto's; hier kleuren we het
  // materiaal, want dit is er maar één.
  bodyMaterial.color = tint;
  group.add(body);

  // Wielen. Elk wiel is een eigen groep zodat het kan draaien én sturen.
  const wheelGeometry = new THREE.CylinderGeometry(
    spec.wheelRadius,
    spec.wheelRadius,
    spec.twoWheeler ? 0.16 : 0.24,
    WHEEL_SEGMENTS,
  );
  wheelGeometry.rotateX(Math.PI / 2);
  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#141619'),
    roughness: 0.85,
    metalness: 0.05,
  });
  const rimGeometry = new THREE.CylinderGeometry(
    spec.wheelRadius * 0.55,
    spec.wheelRadius * 0.55,
    spec.twoWheeler ? 0.18 : 0.26,
    WHEEL_SEGMENTS,
  );
  rimGeometry.rotateX(Math.PI / 2);
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#9aa2ab'),
    roughness: 0.3,
    metalness: 0.85,
  });

  const sideOffset = spec.twoWheeler ? 0 : spec.width * 0.42;
  const layout: { x: number; z: number; steers: boolean }[] = spec.twoWheeler
    ? [
        { x: spec.axle, z: 0, steers: true },
        { x: -spec.axle, z: 0, steers: false },
      ]
    : [
        { x: spec.axle, z: sideOffset, steers: true },
        { x: spec.axle, z: -sideOffset, steers: true },
        { x: -spec.axle, z: sideOffset, steers: false },
        { x: -spec.axle, z: -sideOffset, steers: false },
      ];

  const steerGroups: THREE.Group[] = [];
  const spinGroups: THREE.Group[] = [];
  for (const wheel of layout) {
    const steerGroup = new THREE.Group();
    steerGroup.position.set(wheel.x, spec.wheelRadius, wheel.z);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeometry, wheelMaterial);
    tyre.castShadow = castShadow;
    spin.add(tyre);
    spin.add(new THREE.Mesh(rimGeometry, rimMaterial));
    steerGroup.add(spin);
    group.add(steerGroup);
    spinGroups.push(spin);
    if (wheel.steers) steerGroups.push(steerGroup);
  }

  // Lampen. Ze staan altijd in de scene maar hebben overdag geen gloed; zo
  // hoeft er niets aan- of afgekoppeld te worden tijdens het rijden.
  const lampGeometry = standingBox(0.10, 0.16, 0.34);
  const headMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f2efe0'),
    emissive: new THREE.Color('#ffe9bd'),
    emissiveIntensity: 0,
    roughness: 0.25,
  });
  const tailMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#5e1a17'),
    emissive: new THREE.Color('#ff2a1c'),
    emissiveIntensity: 0,
    roughness: 0.4,
  });

  const lampY = spec.wheelRadius * 0.9 + spec.height * 0.18;
  const lampZ = spec.twoWheeler ? 0 : spec.width * 0.33;
  const headlights: THREE.Mesh[] = [];
  const taillights: THREE.Mesh[] = [];
  for (const side of spec.twoWheeler ? [0] : [1, -1]) {
    const head = new THREE.Mesh(lampGeometry, headMaterial);
    head.position.set(spec.length * 0.48, lampY, side * lampZ);
    group.add(head);
    headlights.push(head);

    if (!spec.twoWheeler) {
      const tail = new THREE.Mesh(lampGeometry, tailMaterial);
      tail.position.set(-spec.length * 0.48, lampY, side * lampZ);
      group.add(tail);
      taillights.push(tail);
    }
  }

  let spin = 0;
  let steerAngle = 0;

  return {
    group,
    seat: new THREE.Vector3(-spec.length * 0.06, spec.wheelRadius * 0.9 + spec.height * 0.22, 0),
    update(delta, speed, steer, braking, night) {
      // Wielomtrek: hoeveel radialen hoort bij deze afstand?
      spin += (speed * delta) / spec.wheelRadius;
      for (const wheel of spinGroups) wheel.rotation.z = -spin;

      const wanted = -steer * 0.52;
      steerAngle += (wanted - steerAngle) * Math.min(1, delta * 10);
      for (const wheel of steerGroups) wheel.rotation.y = steerAngle;

      headMaterial.emissiveIntensity = night * 2.4;
      // Achterlichten branden mee in het donker en fel bij het remmen.
      tailMaterial.emissiveIntensity = night * 0.9 + (braking ? 2.6 : 0);
    },
    place(x, z, heading) {
      group.position.set(x, groundHeightAt(x, z), z);
      group.rotation.y = heading;
    },
    dispose() {
      bodyGeometry.dispose();
      wheelGeometry.dispose();
      rimGeometry.dispose();
      lampGeometry.dispose();
      bodyMaterial.dispose();
      wheelMaterial.dispose();
      rimMaterial.dispose();
      headMaterial.dispose();
      tailMaterial.dispose();
    },
  };
}
