import { SIDEWALK_HEIGHT, marketStalls, shopSpots } from '@game/shared';
import * as THREE from 'three';
import { createCharacter } from './character';
import { mergeParts, standingBox, standingCylinder, type Part } from './geometry';

/**
 * De pandjeshuizen in de stad: een winkelpui met een verkoper ervoor.
 *
 * Bewust géén instanced mesh zoals het straatmeubilair. Er staan er twee in de
 * hele stad, plus een paar lege kramen op het plein; instancing kost daar meer
 * code dan het oplevert. En de verkoper
 * is sowieso een eigen groep, want die ademt.
 *
 * De pui staat met zijn rug tegen de gevel: alles wat naar de straat wijst
 * ligt aan de +z-kant, en de draaiing uit `shopSpots()` zet dat goed. Dat is
 * dezelfde afspraak als bij de lantaarns, waar de arm ook op +z staat.
 */

/**
 * Hoe diep de pui de stoep op mag steken.
 *
 * De stoep is maar anderhalve meter breed en de verkoper staat op 3,6 m uit
 * de as, dus tot aan de stoeprand is er nog geen zeventig centimeter. Alles
 * wat verder uitsteekt hangt boven hoofdhoogte, waar het niemand in de weg zit.
 */
const COUNTER_DEPTH = 0.36;

function shopfrontGeometry(): THREE.BufferGeometry {
  const frame = '#2a2f38';
  const cloth = '#b8452f';
  const wood = '#6b4a30';
  const brass = '#c9a227';

  const parts: Part[] = [
    // Toonbank, met de verkoper erachter.
    { geometry: standingBox(1.7, 0.92, COUNTER_DEPTH), color: wood, position: [0, 0, 0.3] },
    { geometry: standingBox(1.84, 0.07, COUNTER_DEPTH + 0.12), color: '#8a6239', position: [0, 0.92, 0.3] },

    // Twee stijlen die de luifel dragen.
    { geometry: standingCylinder(0.05, 0.05, 2.6, 6), color: frame, position: [-0.86, 0, 0.52] },
    { geometry: standingCylinder(0.05, 0.05, 2.6, 6), color: frame, position: [0.86, 0, 0.52] },

    // Luifel: schuin naar de straat toe, ruim boven hoofdhoogte.
    {
      geometry: standingBox(2.3, 0.09, 1.15),
      color: cloth,
      position: [0, 2.52, 0.36],
      rotation: [-0.18, 0, 0],
    },
    // Het randje aan de voorkant, waar bij een echte luifel de franje hangt.
    { geometry: standingBox(2.3, 0.18, 0.06), color: '#8f3323', position: [0, 2.38, 0.92] },

    // Uithangbord tegen de gevel.
    { geometry: standingBox(1.5, 0.62, 0.08), color: frame, position: [0, 2.95, -0.12] },
    { geometry: standingBox(1.34, 0.46, 0.03), color: '#f1e3c0', position: [0, 3.03, -0.06] },
    // De drie ballen van een pandjeshuis.
    ...[-0.4, 0, 0.4].map(
      (offset): Part => ({
        geometry: new THREE.SphereGeometry(0.11, 8, 6),
        color: brass,
        position: [offset, 3.26, -0.02],
      }),
    ),

    // Wat handel op de toonbank, zodat het niet als een lege kraam leest.
    { geometry: standingBox(0.26, 0.2, 0.2), color: '#7d8794', position: [-0.5, 0.99, 0.3] },
    { geometry: standingBox(0.18, 0.3, 0.18), color: '#3f6d5a', position: [0.44, 0.99, 0.26] },
  ];
  return mergeParts(parts);
}

export interface Shopfronts {
  group: THREE.Group;
  /** Laat de verkopers ademen. */
  update: (delta: number) => void;
  dispose: () => void;
}

/**
 * Een kraam die nog geen winkel is: vier poten en een leeg blad.
 *
 * Bewust herkenbaar als kraam en niet als decor — het is een plek die wacht,
 * en dat hoort te zien te zijn.
 */
function emptyStallGeometry(): THREE.BufferGeometry {
  const hout = '#6b5940';
  const parts: Part[] = [
    { geometry: standingBox(0.10, 0.95, 0.10), color: hout, position: [-0.85, 0, -0.35] },
    { geometry: standingBox(0.10, 0.95, 0.10), color: hout, position: [0.85, 0, -0.35] },
    { geometry: standingBox(0.10, 0.95, 0.10), color: hout, position: [-0.85, 0, 0.35] },
    { geometry: standingBox(0.10, 0.95, 0.10), color: hout, position: [0.85, 0, 0.35] },
    { geometry: standingBox(1.90, 0.09, 0.80), color: '#7d6a4d', position: [0, 0.95, 0] },
  ];
  return mergeParts(parts);
}

export function createShopfronts(castShadow = true): Shopfronts {
  const group = new THREE.Group();
  const geometry = shopfrontGeometry();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.06,
  });

  // De verkoper en de plek waar hij staat: `update` leidt zijn hoogte af uit
  // x en z, dus die moeten mee.
  const clerks: { character: ReturnType<typeof createCharacter>; x: number; z: number }[] = [];

  for (const spot of shopSpots()) {
    const stall = new THREE.Mesh(geometry, material);
    stall.position.set(spot.x, SIDEWALK_HEIGHT, spot.z);
    stall.rotation.y = spot.rotY;
    stall.castShadow = castShadow;
    stall.receiveShadow = false;
    group.add(stall);

    // De verkoper staat een halve meter achter zijn toonbank, dus aan de
    // gevelkant: dat is -z voordat de pui gedraaid wordt.
    const behind = spot.rotY + Math.PI;
    const clerk = createCharacter(
      { skin: '#b07a4e', outfit: '#2c3d5c', accent: '#c9a227' },
      castShadow,
    );
    const cx = spot.x + Math.sin(behind) * 0.55;
    const cz = spot.z + Math.cos(behind) * 0.55;
    clerk.group.position.set(cx, SIDEWALK_HEIGHT, cz);
    clerk.group.rotation.y = spot.rotY;
    group.add(clerk.group);
    clerks.push({ character: clerk, x: cx, z: cz });
  }

  // De lege plekken op het marktplein: een kraam zonder luifel en zonder
  // verkoper. Zonder die kramen is het plein een leeg vlak met één winkel erop;
  // mét zie je dat er ruimte is voor wat er later bij komt.
  const leegGeometry = emptyStallGeometry();
  for (const kraam of marketStalls()) {
    if (kraam.shopId !== null) continue;
    const leeg = new THREE.Mesh(leegGeometry, material);
    leeg.position.set(kraam.x, SIDEWALK_HEIGHT, kraam.z);
    leeg.rotation.y = kraam.rotY;
    leeg.castShadow = castShadow;
    group.add(leeg);
  }

  return {
    group,
    update(delta) {
      for (const clerk of clerks) {
        // Snelheid nul: dan valt het figuurtje terug op ademhaling in plaats
        // van te bevriezen. x en z verplaatsen hem niet — die bepalen alleen
        // of hij op de stoep of op de rijbaan staat.
        clerk.character.update(delta, 0, clerk.x, clerk.z);
      }
    },
    dispose() {
      for (const clerk of clerks) clerk.character.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
