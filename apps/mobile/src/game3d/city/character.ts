import { groundHeightAt } from '@game/shared';
import * as THREE from 'three';
import { mergeParts, standingBox, type Part } from './geometry';

/**
 * Het personage.
 *
 * Bewust een echt figuurtje met armen en benen in plaats van een capsule: je
 * kijkt er het hele spel naar, en niets verraadt sneller dat iets een
 * prototype is dan een zwevende pil. De ledematen draaien om hun eigen
 * schouder- en heuppunt, zodat één loopcyclus genoeg is om beweging te laten
 * kloppen.
 */

export interface CharacterColors {
  skin: string;
  outfit: string;
  accent: string;
}

const HEIGHT = 1.82;
const HIP_Y = 0.92;
const SHOULDER_Y = 1.44;

function upperBody(colors: CharacterColors): THREE.BufferGeometry {
  const trouser = '#2f3542';
  const parts: Part[] = [
    // Bekken en romp, iets taps zodat het geen doos blijft.
    { geometry: standingBox(0.46, 0.20, 0.26), color: trouser, position: [0, HIP_Y - 0.10, 0] },
    { geometry: standingBox(0.44, 0.42, 0.25), color: colors.outfit, position: [0, HIP_Y + 0.08, 0] },
    { geometry: standingBox(0.50, 0.16, 0.27), color: colors.outfit, position: [0, HIP_Y + 0.48, 0] },
    // Hals en hoofd.
    { geometry: standingBox(0.14, 0.09, 0.14), color: colors.skin, position: [0, SHOULDER_Y + 0.20, 0] },
    {
      geometry: new THREE.SphereGeometry(0.145, 12, 10),
      color: colors.skin,
      position: [0, SHOULDER_Y + 0.36, 0],
      scale: [1, 1.12, 1.02],
    },
    // Pet: laat ook zien welke kant je op kijkt.
    {
      geometry: new THREE.SphereGeometry(0.152, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
      color: colors.accent,
      position: [0, SHOULDER_Y + 0.37, 0],
      scale: [1, 0.8, 1.02],
    },
    { geometry: standingBox(0.20, 0.03, 0.13), color: colors.accent, position: [0, SHOULDER_Y + 0.37, 0.14] },
  ];
  return mergeParts(parts);
}

/** Arm of been hangt vanaf het draaipunt naar beneden. */
function limb(
  length: number,
  width: number,
  depth: number,
  sleeve: string,
  skin: string,
  shoe?: string,
): THREE.BufferGeometry {
  const sleeveLength = length * 0.58;
  const parts: Part[] = [
    {
      geometry: standingBox(width, sleeveLength, depth),
      color: sleeve,
      position: [0, -sleeveLength, 0],
    },
    {
      geometry: standingBox(width * 0.86, length - sleeveLength, depth * 0.86),
      color: shoe ? sleeve : skin,
      position: [0, -length, 0],
    },
  ];
  if (shoe) {
    parts.push({
      geometry: standingBox(width * 1.05, 0.09, depth * 1.7),
      color: shoe,
      position: [0, -length - 0.09, 0.04],
    });
  } else {
    parts.push({
      geometry: new THREE.SphereGeometry(width * 0.52, 8, 6),
      color: skin,
      position: [0, -length - 0.03, 0],
    });
  }
  return mergeParts(parts);
}

/** Zachte contactschaduw als verloop; goedkoper dan een echte schaduw. */
function shadowTexture(): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const distance = Math.sqrt(dx * dx + dy * dy) * 2;
      const alpha = Math.max(0, 1 - distance) ** 1.8;
      const index = (y * size + x) * 4;
      data[index + 3] = Math.round(alpha * 210);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

export interface Character {
  group: THREE.Group;
  /**
   * `speed` is de loopsnelheid in meter per seconde; op nul valt het figuurtje
   * terug in een rustige ademhaling in plaats van te bevriezen.
   */
  update: (delta: number, speed: number, x: number, z: number) => void;
  setColors: (colors: CharacterColors) => void;
  dispose: () => void;
}

export function createCharacter(initial: CharacterColors, castShadow = true): Character {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.03,
  });

  let colors = initial;
  const torso = new THREE.Mesh(upperBody(colors), material);
  const arms = [new THREE.Group(), new THREE.Group()];
  const legs = [new THREE.Group(), new THREE.Group()];
  const armMeshes: THREE.Mesh[] = [];
  const legMeshes: THREE.Mesh[] = [];

  body.add(torso);
  arms.forEach((arm, index) => {
    arm.position.set(index === 0 ? -0.29 : 0.29, SHOULDER_Y + 0.02, 0);
    const mesh = new THREE.Mesh(limb(0.62, 0.13, 0.14, colors.outfit, colors.skin), material);
    mesh.castShadow = castShadow;
    armMeshes.push(mesh);
    arm.add(mesh);
    body.add(arm);
  });
  legs.forEach((leg, index) => {
    leg.position.set(index === 0 ? -0.13 : 0.13, HIP_Y - 0.10, 0);
    const mesh = new THREE.Mesh(limb(0.78, 0.17, 0.18, '#2f3542', colors.skin, colors.accent), material);
    mesh.castShadow = castShadow;
    legMeshes.push(mesh);
    leg.add(mesh);
    body.add(leg);
  });
  torso.castShadow = castShadow;

  const shadowMap = shadowTexture();
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({
      map: shadowMap,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
      color: new THREE.Color('#0b1016'),
    }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.renderOrder = 2;
  group.add(blob);

  let phase = 0;

  return {
    group,
    update(delta, speed, x, z) {
      const ground = groundHeightAt(x, z);
      // Zacht naar de stoephoogte toe, anders schokt hij op elke stoeprand.
      group.position.y += (ground - group.position.y) * Math.min(1, delta * 14);

      const walking = Math.min(speed / 4.5, 1.4);
      phase += delta * (2.2 + walking * 6.0);

      const swing = Math.sin(phase) * 0.62 * walking;
      const counter = Math.sin(phase + Math.PI) * 0.52 * walking;
      legs[0]!.rotation.x = swing;
      legs[1]!.rotation.x = -swing;
      arms[0]!.rotation.x = -swing * 0.8;
      arms[1]!.rotation.x = swing * 0.8;
      arms[0]!.rotation.z = 0.08 + counter * 0.05;
      arms[1]!.rotation.z = -0.08 - counter * 0.05;

      // Op- en neergaan gebeurt twee keer per pas, ademhalen veel trager.
      const bob = walking > 0.02 ? Math.abs(Math.sin(phase)) * 0.055 * walking : 0;
      const breathe = Math.sin(phase * 0.5) * 0.012;
      body.position.y = bob + breathe;
      body.rotation.x = walking * 0.07;

      blob.position.y = 0.03 - bob * 0.5;
      (blob.material as THREE.MeshBasicMaterial).opacity = 0.55 - bob * 1.2;
    },
    setColors(next) {
      colors = next;
      torso.geometry.dispose();
      torso.geometry = upperBody(colors);
      for (const mesh of armMeshes) {
        mesh.geometry.dispose();
        mesh.geometry = limb(0.62, 0.13, 0.14, colors.outfit, colors.skin);
      }
      for (const mesh of legMeshes) {
        mesh.geometry.dispose();
        mesh.geometry = limb(0.78, 0.17, 0.18, '#2f3542', colors.skin, colors.accent);
      }
    },
    dispose() {
      torso.geometry.dispose();
      for (const mesh of [...armMeshes, ...legMeshes]) mesh.geometry.dispose();
      blob.geometry.dispose();
      (blob.material as THREE.Material).dispose();
      material.dispose();
      shadowMap.dispose();
    },
  };
}

export const CHARACTER_HEIGHT = HEIGHT;
