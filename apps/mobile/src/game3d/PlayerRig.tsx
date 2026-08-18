import { ECONOMY, resolveMovement } from '@game/shared';
import { useFrame, useThree } from '@react-three/fiber/native';
import { useRef } from 'react';
import * as THREE from 'three';
import { cameraState, moveInput, playerPosition, travelBuffer } from '../state/position';
import { useGame } from '../state/useGame';

const PLAYER_RADIUS = 0.5;
const cameraTarget = new THREE.Vector3();

/**
 * Beweging en camera.
 *
 * De speler beweegt in de richting waarin de camera kijkt: duw je de joystick
 * naar voren, dan loop je van de camera af. Botsingen worden afgehandeld met
 * `resolveMovement` uit @game/shared — precies dezelfde functie die de server
 * gebruikt om een gemelde positie te controleren.
 */
export function PlayerRig() {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const facing = useRef(0);

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

    if (magnitude > 0.05) {
      const step = speed * delta;
      const next = resolveMovement(
        playerPosition.x,
        playerPosition.z,
        playerPosition.x + moveX * step,
        playerPosition.z + moveZ * step,
        PLAYER_RADIUS,
      );
      travelBuffer.meters += Math.hypot(next.x - playerPosition.x, next.z - playerPosition.z);
      playerPosition.x = next.x;
      playerPosition.z = next.z;
      facing.current = Math.atan2(moveX, moveZ);
    }

    const group = groupRef.current;
    if (group) {
      group.position.set(playerPosition.x, 0, playerPosition.z);
      // Zacht meedraaien in plaats van klikken.
      const diff = ((facing.current - group.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
      group.rotation.y += diff * Math.min(1, delta * 12);
    }

    cameraTarget.set(
      playerPosition.x + Math.sin(yaw) * cameraState.distance,
      cameraState.height,
      playerPosition.z + Math.cos(yaw) * cameraState.distance,
    );
    camera.position.lerp(cameraTarget, 1 - Math.pow(0.0015, delta));
    camera.lookAt(playerPosition.x, 1.4, playerPosition.z);
  });

  return (
    <group ref={groupRef}>
      {/* Schaduwvlek: goedkoper dan een echte schaduw en leest net zo goed. */}
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.7, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} />
      </mesh>
      <mesh position={[0, 1.05, 0]}>
        <capsuleGeometry args={[0.42, 0.9, 4, 10]} />
        <meshLambertMaterial color="#4dd4ac" />
      </mesh>
      <mesh position={[0, 1.75, 0]}>
        <sphereGeometry args={[0.34, 14, 12]} />
        <meshLambertMaterial color="#f2d7b8" />
      </mesh>
      {/* Klein neusje zodat je ziet welke kant je op kijkt. */}
      <mesh position={[0, 1.72, 0.34]}>
        <boxGeometry args={[0.16, 0.16, 0.2]} />
        <meshLambertMaterial color="#2b3a55" />
      </mesh>
    </group>
  );
}
