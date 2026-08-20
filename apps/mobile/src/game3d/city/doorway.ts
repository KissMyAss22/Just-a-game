import { SIDEWALK_HEIGHT, type HomeAddress } from '@game/shared';
import * as THREE from 'three';
import { mergeParts, standingBox, standingCylinder, type Part } from './geometry';

/**
 * Voordeuren en Te Koop-borden.
 *
 * Opgezet als `shopfront.ts`: geen instanced mesh, want er staan er maar een
 * handvol in de stad tegelijk. De pui staat met zijn rug tegen de gevel, dus
 * alles wat naar de straat wijst ligt aan de +z-kant en de draaiing uit het
 * adres zet dat goed — dezelfde afspraak als bij de lantaarns en de winkels.
 */

function doorGeometry(owned: boolean): THREE.BufferGeometry {
  const frame = owned ? '#3c4a3f' : '#4a4038';
  const panel = owned ? '#2f6f5e' : '#6b5b4a';
  const brass = '#c9a227';

  const parts: Part[] = [
    // Deurkozijn tegen de gevel.
    { geometry: standingBox(1.24, 2.28, 0.1), color: frame, position: [0, 0, -0.02] },
    { geometry: standingBox(1.0, 2.1, 0.06), color: panel, position: [0, 0.04, 0.04] },
    // Klink.
    {
      geometry: standingCylinder(0.045, 0.045, 0.16, 6),
      color: brass,
      position: [0.36, 1.02, 0.08],
      rotation: [Math.PI / 2, 0, 0],
    },
    // Stoepje, zodat de deur niet uit de lucht komt.
    { geometry: standingBox(1.4, 0.09, 0.5), color: '#6a6a6a', position: [0, -0.09, 0.22] },
  ];

  if (owned) {
    // Een lampje boven je eigen deur, zodat je hem 's avonds terugvindt.
    parts.push(
      { geometry: standingBox(0.3, 0.12, 0.22), color: frame, position: [0, 2.34, 0.06] },
      { geometry: standingBox(0.22, 0.1, 0.14), color: '#f6ecd2', position: [0, 2.26, 0.1] },
    );
  }
  return mergeParts(parts);
}

/**
 * Het bord dat bij een pand staat dat te koop is.
 *
 * Naast de deur en niet ervoor: op 0,5 m stond het pal voor het deurblad, en
 * dan lijkt het alsof het pand is dichtgetimmerd in plaats van te koop staat.
 * Het deurkozijn is 1,24 breed, dus vanaf 1,1 m staat het bord vrij.
 */
function saleSignGeometry(): THREE.BufferGeometry {
  const post = '#4a4038';
  const x = 1.15;
  const parts: Part[] = [
    { geometry: standingCylinder(0.05, 0.05, 1.9, 6), color: post, position: [x, 0, 0.3] },
    { geometry: standingBox(0.95, 0.62, 0.06), color: '#f1e3c0', position: [x, 1.24, 0.3] },
    // Een rode balk bovenaan: dat leest van ver als "te koop".
    { geometry: standingBox(0.95, 0.2, 0.07), color: '#b8452f', position: [x, 1.6, 0.3] },
  ];
  return mergeParts(parts);
}

export interface DoorMarker {
  address: HomeAddress;
  /** Woon je hier, of staat het te koop? */
  owned: boolean;
}

export interface Doorways {
  group: THREE.Group;
  dispose: () => void;
}

export function createDoorways(markers: readonly DoorMarker[], castShadow = true): Doorways {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.05,
  });

  const geometries: THREE.BufferGeometry[] = [];

  for (const marker of markers) {
    const door = doorGeometry(marker.owned);
    geometries.push(door);
    const mesh = new THREE.Mesh(door, material);
    mesh.position.set(marker.address.x, SIDEWALK_HEIGHT, marker.address.z);
    mesh.rotation.y = marker.address.rotY;
    mesh.castShadow = castShadow;
    group.add(mesh);

    if (!marker.owned) {
      const sign = saleSignGeometry();
      geometries.push(sign);
      const signMesh = new THREE.Mesh(sign, material);
      signMesh.position.set(marker.address.x, SIDEWALK_HEIGHT, marker.address.z);
      signMesh.rotation.y = marker.address.rotY;
      signMesh.castShadow = castShadow;
      group.add(signMesh);
    }
  }

  return {
    group,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      material.dispose();
    },
  };
}
