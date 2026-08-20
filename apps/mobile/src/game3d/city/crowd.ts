import { appearanceColors, getVehicle, groundHeightAt } from '@game/shared';
import * as THREE from 'three';
import { createCharacter, type Character } from './character';
import { createVehicle, type Vehicle } from './vehicle';
import { interpolate, remotePlayers } from '../../net/presence';

/**
 * De andere spelers in de stad.
 *
 * Elke speler krijgt hetzelfde figuurtje en hetzelfde voertuig als jijzelf —
 * dezelfde bouwers, dus wat jij ziet is precies wat zij zien. Ze worden
 * aangemaakt zodra ze in beeld komen en opgeruimd als ze uit het zichtgebied
 * lopen.
 *
 * De server stuurt tien standen per seconde en het scherm tekent er zestig.
 * Daartussen wordt geïnterpoleerd; zonder dat schokt iedereen vooruit alsof
 * hun app hapert.
 */

/** Wat de HUD nodig heeft om een naambordje op het scherm te zetten. */
export interface NamePlate {
  id: string;
  name: string;
  level: number;
  /** Positie in beeldpunten, linksboven is 0,0. */
  x: number;
  y: number;
  /** Achter de camera of te ver weg: dan niet tekenen. */
  visible: boolean;
}

interface Slot {
  character: Character;
  vehicle: Vehicle | null;
  vehicleId: string;
  lastX: number;
  lastZ: number;
  /** Gladgestreken loopsnelheid, voor het looppasje. */
  speed: number;
}

export interface Crowd {
  group: THREE.Group;
  /** De bordjes van dit frame; de HUD leest ze op zijn eigen tempo. */
  plates: NamePlate[];
  update: (
    camera: THREE.Camera,
    width: number,
    height: number,
    delta: number,
    night: number,
  ) => void;
  dispose: () => void;
}

const projected = new THREE.Vector3();

export function createCrowd(castShadow = false): Crowd {
  const group = new THREE.Group();
  const slots = new Map<string, Slot>();
  const plates: NamePlate[] = [];

  function release(id: string, slot: Slot): void {
    group.remove(slot.character.group);
    slot.character.dispose();
    if (slot.vehicle) {
      group.remove(slot.vehicle.group);
      slot.vehicle.dispose();
    }
    slots.delete(id);
  }

  return {
    group,
    plates,
    update(camera, width, height, delta, night) {
      const now = Date.now();
      plates.length = 0;

      for (const [id, tracked] of remotePlayers) {
        const player = tracked.latest;
        const colors = appearanceColors({ skin: player.s, outfit: player.o, accent: player.a });

        let slot = slots.get(id);
        if (!slot) {
          const character = createCharacter(colors, castShadow);
          group.add(character.group);
          slot = {
            character,
            vehicle: null,
            vehicleId: player.v,
            lastX: player.x,
            lastZ: player.z,
            speed: 0,
          };
          slots.set(id, slot);
        }

        const at = interpolate(tracked, now);
        const moved = Math.hypot(at.x - slot.lastX, at.z - slot.lastZ);
        slot.lastX = at.x;
        slot.lastZ = at.z;
        const wanted = delta > 0 ? moved / delta : 0;
        slot.speed += (wanted - slot.speed) * Math.min(1, delta * 8);

        const definition = getVehicle(player.v);
        const driving = player.d === 1 && definition.drivable;
        if (driving && (!slot.vehicle || slot.vehicleId !== player.v)) {
          if (slot.vehicle) {
            group.remove(slot.vehicle.group);
            slot.vehicle.dispose();
          }
          slot.vehicle = createVehicle(definition, colors.accent, castShadow);
          slot.vehicleId = player.v;
          group.add(slot.vehicle.group);
        }

        slot.character.group.visible = !driving;
        slot.character.group.position.x = at.x;
        slot.character.group.position.z = at.z;
        slot.character.group.rotation.y = at.heading;
        slot.character.update(delta, driving ? 0 : slot.speed, at.x, at.z);

        if (slot.vehicle) {
          slot.vehicle.group.visible = driving;
          if (driving) {
            slot.vehicle.place(at.x, at.z, at.heading);
            slot.vehicle.update(delta, slot.speed, 0, false, night);
          }
        }

        // Naambordje: het punt boven het hoofd omrekenen naar beeldpunten.
        projected.set(at.x, groundHeightAt(at.x, at.z) + (driving ? 2.3 : 2.15), at.z);
        projected.project(camera);
        plates.push({
          id,
          name: player.n,
          level: player.level,
          x: (projected.x * 0.5 + 0.5) * width,
          y: (-projected.y * 0.5 + 0.5) * height,
          // z buiten [-1,1] betekent achter de camera of voorbij de far-plane.
          visible: projected.z > -1 && projected.z < 1,
        });
      }

      for (const [id, slot] of slots) {
        if (!remotePlayers.has(id)) release(id, slot);
      }
    },
    dispose() {
      for (const [id, slot] of [...slots]) release(id, slot);
      plates.length = 0;
    },
  };
}
