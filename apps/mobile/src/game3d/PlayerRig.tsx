import {
  DEFAULT_APPEARANCE,
  ECONOMY,
  appearanceColors,
  groundHeightAt,
  resolveMovement,
} from '@game/shared';
import { useFrame, useThree } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createCharacter } from './city/character';
import { cameraState, moveInput, playerPosition, travelBuffer } from '../state/position';
import { useGame } from '../state/useGame';

const PLAYER_RADIUS = 0.5;
const cameraTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

/**
 * Beweging en camera.
 *
 * De speler beweegt in de richting waarin de camera kijkt: duw je de joystick
 * naar voren, dan loop je van de camera af. Botsingen worden afgehandeld met
 * `resolveMovement` uit @game/shared — precies dezelfde functie die de server
 * gebruikt om een gemelde positie te controleren.
 */
export function PlayerRig() {
  const { scene, camera } = useThree();
  const facing = useRef(0);
  const speedRef = useRef(0);

  const appearance = useGame((s) => s.state?.player.appearance) ?? DEFAULT_APPEARANCE;
  const colors = appearanceColors(appearance);
  const character = useMemo(() => createCharacter(colors), []);

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

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const speed = useGame.getState().state?.stats.moveSpeed ?? ECONOMY.baseMoveSpeed;

    const yaw = cameraState.yaw;
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

    let travelled = 0;
    if (magnitude > 0.05) {
      const step = speed * delta;
      const next = resolveMovement(
        playerPosition.x,
        playerPosition.z,
        playerPosition.x + moveX * step,
        playerPosition.z + moveZ * step,
        PLAYER_RADIUS,
      );
      travelled = Math.hypot(next.x - playerPosition.x, next.z - playerPosition.z);
      travelBuffer.meters += travelled;
      playerPosition.x = next.x;
      playerPosition.z = next.z;
      facing.current = Math.atan2(moveX, moveZ);
    }
    // Zacht afremmen, zodat het looppasje niet midden in een stap bevriest.
    const wanted = delta > 0 ? travelled / delta : 0;
    speedRef.current += (wanted - speedRef.current) * Math.min(1, delta * 9);

    const group = character.group;
    group.position.x = playerPosition.x;
    group.position.z = playerPosition.z;
    // Zacht meedraaien in plaats van klikken.
    const diff = ((facing.current - group.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
    group.rotation.y += diff * Math.min(1, delta * 12);
    character.update(delta, speedRef.current, playerPosition.x, playerPosition.z);

    const ground = groundHeightAt(playerPosition.x, playerPosition.z);
    cameraTarget.set(
      playerPosition.x + Math.sin(yaw) * cameraState.distance,
      ground + cameraState.height,
      playerPosition.z + Math.cos(yaw) * cameraState.distance,
    );
    camera.position.lerp(cameraTarget, 1 - Math.pow(0.0018, delta));
    lookTarget.set(playerPosition.x, ground + 1.5, playerPosition.z);
    camera.lookAt(lookTarget);
  });

  return null;
}
