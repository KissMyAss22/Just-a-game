import {
  DEFAULT_APPEARANCE,
  ECONOMY,
  appearanceColors,
  driveStep,
  getVehicle,
  groundHeightAt,
  resolveMovement,
} from '@game/shared';
import { useFrame, useThree } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createCharacter } from './city/character';
import { NIGHT_UNIFORM } from './city/materials';
import { createVehicle } from './city/vehicle';
import { localPresence } from '../net/presence';
import { cameraState, driveState, moveInput, playerPosition, travelBuffer } from '../state/position';
import { parkBeside, useDriving } from '../state/useDriving';
import { useGame } from '../state/useGame';

const PLAYER_RADIUS = 0.5;
/** Hoe ver de camera extra naar achteren gaat zodra je rijdt. */
const DRIVE_CAMERA_PULLBACK = 1.5;
/** Zo lang laat de camera je met rust nadat je zelf gedraaid hebt. */
const CAMERA_HANDOVER_MS = 1400;

const cameraTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

/**
 * Beweging, voertuig en camera.
 *
 * Te voet beweeg je in de richting waarin de camera kijkt. Rijdend heeft de
 * auto zijn eigen koers: de joystick is dan gas en stuur, en de camera zwenkt
 * er vanzelf achter. Botsingen lopen in beide gevallen via functies uit
 * @game/shared — precies dezelfde die de server gebruikt om een gemelde
 * positie te controleren.
 */
export function PlayerRig() {
  const { scene, camera } = useThree();
  const facing = useRef(0);
  const speedRef = useRef(0);

  const appearance = useGame((s) => s.state?.player.appearance) ?? DEFAULT_APPEARANCE;
  const colors = appearanceColors(appearance);
  const vehicleId = useGame((s) => s.state?.player.vehicleId) ?? 'on_foot';
  const vehicleDef = useMemo(() => getVehicle(vehicleId), [vehicleId]);

  const character = useMemo(() => createCharacter(colors), []);
  const vehicle = useMemo(
    () => (vehicleDef.drivable ? createVehicle(vehicleDef, colors.accent) : null),
    [vehicleDef, colors.accent],
  );

  useEffect(() => {
    character.setColors(colors);
  }, [character, colors.skin, colors.outfit, colors.accent]);

  useEffect(() => {
    scene.add(character.group);
    return () => {
      scene.remove(character.group);
      character.dispose();
    };
  }, [scene, character]);

  useEffect(() => {
    if (!vehicle) return;
    // Nieuw voertuig: zet het naast de speler en stap uit, anders zou je in
    // een auto zitten die net vervangen is.
    parkBeside(playerPosition.x, playerPosition.z, facing.current);
    vehicle.place(driveState.x, driveState.z, driveState.heading);
    scene.add(vehicle.group);
    useDriving.getState().setActive(false);
    return () => {
      scene.remove(vehicle.group);
      vehicle.dispose();
    };
  }, [scene, vehicle]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const state = useGame.getState().state;
    const driving = useDriving.getState().active && vehicle !== null;

    const yaw = cameraState.yaw;
    let travelled = 0;

    if (driving && vehicle) {
      const topSpeed = state?.stats.moveSpeed ?? ECONOMY.baseMoveSpeed;
      const before = { x: driveState.x, z: driveState.z };
      const next = driveStep(
        driveState,
        { throttle: moveInput.y, steer: moveInput.x },
        vehicleDef,
        topSpeed,
        delta,
      );
      driveState.x = next.x;
      driveState.z = next.z;
      driveState.heading = next.heading;
      driveState.speed = next.speed;
      driveState.steer = moveInput.x;
      // Remmen is: gas tegen je rijrichting in.
      driveState.braking = moveInput.y * next.speed < -0.05;

      travelled = Math.hypot(next.x - before.x, next.z - before.z);
      playerPosition.x = next.x;
      playerPosition.z = next.z;
      facing.current = next.heading;

      vehicle.place(next.x, next.z, next.heading);
      vehicle.update(delta, next.speed, driveState.steer, driveState.braking, NIGHT_UNIFORM.value);
      character.group.visible = false;
    } else {
      const walkSpeed = state?.stats.walkSpeed ?? ECONOMY.baseMoveSpeed;
      const forwardX = -Math.sin(yaw);
      const forwardZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);

      let moveX = rightX * moveInput.x + forwardX * moveInput.y;
      let moveZ = rightZ * moveInput.x + forwardZ * moveInput.y;
      const magnitude = Math.hypot(moveX, moveZ);
      if (magnitude > 1) {
        moveX /= magnitude;
        moveZ /= magnitude;
      }

      if (magnitude > 0.05) {
        const step = walkSpeed * delta;
        const next = resolveMovement(
          playerPosition.x,
          playerPosition.z,
          playerPosition.x + moveX * step,
          playerPosition.z + moveZ * step,
          PLAYER_RADIUS,
        );
        travelled = Math.hypot(next.x - playerPosition.x, next.z - playerPosition.z);
        playerPosition.x = next.x;
        playerPosition.z = next.z;
        facing.current = Math.atan2(moveX, moveZ);
      }

      character.group.visible = true;
      character.group.position.x = playerPosition.x;
      character.group.position.z = playerPosition.z;
      const diff =
        ((facing.current - character.group.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
      character.group.rotation.y += diff * Math.min(1, delta * 12);
      driveState.speed = 0;
      // Je auto blijft staan waar je hem hebt neergezet.
      if (vehicle) {
        vehicle.place(driveState.x, driveState.z, driveState.heading);
        vehicle.update(delta, 0, 0, false, NIGHT_UNIFORM.value);
      }
    }

    travelBuffer.meters += travelled;
    // Wat de andere spelers van jou te zien krijgen. De verbinding stuurt dit
    // tien keer per seconde door; hier houden we het alleen bij.
    localPresence.x = playerPosition.x;
    localPresence.z = playerPosition.z;
    localPresence.heading = facing.current;
    localPresence.driving = driving ? 1 : 0;
    const wanted = delta > 0 ? travelled / delta : 0;
    speedRef.current += (wanted - speedRef.current) * Math.min(1, delta * 9);
    character.update(delta, driving ? 0 : speedRef.current, playerPosition.x, playerPosition.z);

    // Tijdens het rijden zwenkt de camera achter de auto, maar pas als de
    // speler zelf even niet aan het kijken is.
    if (driving && Date.now() - cameraState.userYawAt > CAMERA_HANDOVER_MS) {
      const wantedYaw = driveState.heading + Math.PI;
      const delta2 = ((wantedYaw - cameraState.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      cameraState.yaw += delta2 * Math.min(1, delta * 2.2);
    }

    const ground = groundHeightAt(playerPosition.x, playerPosition.z);
    const distance = cameraState.distance * (driving ? DRIVE_CAMERA_PULLBACK : 1);
    const height = cameraState.height * (driving ? 1.1 : 1);
    cameraTarget.set(
      playerPosition.x + Math.sin(cameraState.yaw) * distance,
      ground + height,
      playerPosition.z + Math.cos(cameraState.yaw) * distance,
    );
    camera.position.lerp(cameraTarget, 1 - Math.pow(driving ? 0.0006 : 0.0018, delta));
    lookTarget.set(playerPosition.x, ground + (driving ? 1.9 : 1.5), playerPosition.z);
    camera.lookAt(lookTarget);
  });

  return null;
}
