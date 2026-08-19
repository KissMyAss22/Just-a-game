import * as THREE from 'three';

/**
 * Kleine bouwdoos om samengestelde objecten tot één geometrie te smelten.
 *
 * Een lantaarnpaal bestaat uit een mast, een arm en een lamp. Als losse meshes
 * zijn dat drie tekenopdrachten per paal; samengesmolten is het er één voor
 * alle palen in beeld. De kleur van elk onderdeel wordt in de punten gebakken,
 * zodat één materiaal genoeg is en de instance-kleur er nog overheen kan als
 * tint — precies wat je wil voor bijvoorbeeld autolak.
 */

export interface Part {
  geometry: THREE.BufferGeometry;
  /** Kleur van dit onderdeel, als vertexkleur meegebakken. */
  color: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

const scratchMatrix = new THREE.Matrix4();
const scratchEuler = new THREE.Euler();
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();

export function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();

  for (const part of parts) {
    const source = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    scratchPosition.set(...(part.position ?? [0, 0, 0]));
    scratchEuler.set(...(part.rotation ?? [0, 0, 0]));
    scratchQuaternion.setFromEuler(scratchEuler);
    scratchScale.set(...(part.scale ?? [1, 1, 1]));
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    source.applyMatrix4(scratchMatrix);

    const pos = source.getAttribute('position');
    const nor = source.getAttribute('normal');
    color.set(part.color);
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      colors.push(color.r, color.g, color.b);
    }
    source.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
}

/** Een doos met het nulpunt op de onderkant; dat rekent makkelijker. */
export function standingBox(width: number, height: number, depth: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.translate(0, height / 2, 0);
  return geometry;
}

export function standingCylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments = 8,
): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
  geometry.translate(0, height / 2, 0);
  return geometry;
}
