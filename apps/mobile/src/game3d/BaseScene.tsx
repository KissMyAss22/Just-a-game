import {
  HOME_CELL_SIZE,
  doorCell,
  homeCellToWorld,
  itemHeight,
  placedItemCenter,
  rotatedFootprint,
  type FloorPlan,
  type PlacedItem,
} from '@game/shared';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { useRef } from 'react';
import * as THREE from 'three';
import { rarityColor } from '../ui/theme';
import { getItem } from '@game/shared';

/** Hoogte van de muurtjes: hoog genoeg om een kamer te zijn, laag genoeg om
 *  overheen te kijken vanuit elke hoek. */
const WALL_HEIGHT = 0.9;
const WALL_THICKNESS = 0.12;

/**
 * De camera en de schermmaat, zodat een tik buiten de Canvas omgerekend kan
 * worden naar een cel. R3F's eigen event-systeem wordt bewust niet gebruikt:
 * zelf rekenen is voorspelbaarder en werkt gelijk op alle toestellen.
 */
export const cameraHandle: { camera: THREE.Camera | null; width: number; height: number } = {
  camera: null,
  width: 1,
  height: 1,
};

/** Draaihoek van de camera rond de kamer, in radialen. */
export const homeCameraState = { yaw: Math.PI * 0.15, distance: 10, height: 8 };

/**
 * Rekent een tik op het scherm om naar een punt op de vloer.
 * Schiet een straal door het scherm en snijdt die met het vlak y = 0.
 */
export function screenToFloor(screenX: number, screenY: number): { x: number; z: number } | null {
  const { camera, width, height } = cameraHandle;
  if (!camera || width <= 0 || height <= 0) return null;

  const ndc = new THREE.Vector3((screenX / width) * 2 - 1, -(screenY / height) * 2 + 1, 0.5);
  ndc.unproject(camera);

  const origin = camera.position;
  const direction = ndc.sub(origin).normalize();
  // Evenwijdig aan de vloer: geen snijpunt.
  if (Math.abs(direction.y) < 1e-6) return null;

  const t = -origin.y / direction.y;
  if (t <= 0) return null;

  return { x: origin.x + direction.x * t, z: origin.z + direction.z * t };
}

function CameraRig({ plan }: { plan: FloorPlan }) {
  const { camera, size } = useThree();
  const target = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    cameraHandle.camera = camera;
    cameraHandle.width = size.width;
    cameraHandle.height = size.height;

    // Grotere kamers vragen meer afstand, anders valt de helft buiten beeld.
    const span = Math.max(plan.width, plan.depth) * HOME_CELL_SIZE;
    const distance = span * 1.1 + 3;
    const height = span * 0.85 + 3;

    target.current.set(
      Math.sin(homeCameraState.yaw) * distance,
      height,
      Math.cos(homeCameraState.yaw) * distance,
    );
    camera.position.lerp(target.current, 1 - Math.pow(0.0015, Math.min(delta, 0.05)));
    camera.lookAt(0, 0.4, 0);
  });

  return null;
}

function Walls({ plan }: { plan: FloorPlan }) {
  const width = plan.width * HOME_CELL_SIZE;
  const depth = plan.depth * HOME_CELL_SIZE;
  const door = doorCell(plan);
  const doorWorld = homeCellToWorld(plan, door.x, door.z);

  return (
    <group>
      {/* Achter- en zijmuren zijn doorlopend. */}
      <mesh position={[0, WALL_HEIGHT / 2, -depth / 2]}>
        <boxGeometry args={[width + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshLambertMaterial color={plan.wallColor} />
      </mesh>
      <mesh position={[-width / 2, WALL_HEIGHT / 2, 0]}>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, depth]} />
        <meshLambertMaterial color={plan.wallColor} />
      </mesh>
      <mesh position={[width / 2, WALL_HEIGHT / 2, 0]}>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, depth]} />
        <meshLambertMaterial color={plan.wallColor} />
      </mesh>

      {/* De voormuur heeft een gat waar de deur zit. */}
      {[-1, 1].map((side) => {
        const segment = width / 2 - HOME_CELL_SIZE / 2;
        if (segment <= 0.01) return null;
        const center = doorWorld.x + side * (HOME_CELL_SIZE / 2 + segment / 2);
        return (
          <mesh key={side} position={[center, WALL_HEIGHT / 2, depth / 2]}>
            <boxGeometry args={[segment, WALL_HEIGHT, WALL_THICKNESS]} />
            <meshLambertMaterial color={plan.wallColor} />
          </mesh>
        );
      })}
    </group>
  );
}

interface FloorProps {
  plan: FloorPlan;
  /** Cel waar de speler nu op wijst. */
  highlight: { x: number; z: number } | null;
  /** Is die plek geldig? Bepaalt groen of rood. */
  highlightValid: boolean;
}

function Floor({ plan, highlight, highlightValid }: FloorProps) {
  const door = doorCell(plan);
  const tiles = [];

  for (let z = 0; z < plan.depth; z++) {
    for (let x = 0; x < plan.width; x++) {
      const world = homeCellToWorld(plan, x, z);
      const isDoor = x === door.x && z === door.z;
      const isHighlight = highlight?.x === x && highlight?.z === z;
      const color = isHighlight
        ? highlightValid
          ? '#4dd4ac'
          : '#ff6b6b'
        : isDoor
          ? '#2a2f3a'
          : plan.floorColor;

      tiles.push(
        <mesh key={`${x}:${z}`} position={[world.x, isHighlight ? 0.03 : 0, world.z]}>
          <boxGeometry args={[HOME_CELL_SIZE * 0.96, 0.06, HOME_CELL_SIZE * 0.96]} />
          <meshLambertMaterial color={color} />
        </mesh>,
      );
    }
  }

  return <group>{tiles}</group>;
}

function Furniture({
  plan,
  placements,
  selectedId,
}: {
  plan: FloorPlan;
  placements: readonly PlacedItem[];
  selectedId: string | null;
}) {
  return (
    <group>
      {placements.map((placed) => {
        const item = getItem(placed.itemId);
        const box = placedItemCenter(plan, placed);
        const height = itemHeight(placed.itemId);
        const selected = placed.id === selectedId;
        return (
          <group key={placed.id} position={[box.x, 0, box.z]}>
            <mesh position={[0, height / 2 + 0.06, 0]}>
              <boxGeometry args={[box.width * 0.82, height, box.depth * 0.82]} />
              <meshLambertMaterial
                color={rarityColor[item.rarity] ?? '#9ca3af'}
                emissive={selected ? '#4dd4ac' : '#000000'}
                emissiveIntensity={selected ? 0.45 : 0}
              />
            </mesh>
            {/* Ring om het geselecteerde voorwerp. */}
            {selected ? (
              <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[box.width * 0.5, box.width * 0.6, 24]} />
                <meshBasicMaterial color="#4dd4ac" side={THREE.DoubleSide} />
              </mesh>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

export interface BaseSceneProps extends FloorProps {
  placements: readonly PlacedItem[];
  selectedId: string | null;
}

export function BaseScene({
  plan,
  placements,
  selectedId,
  highlight,
  highlightValid,
}: BaseSceneProps) {
  return (
    <Canvas
      gl={{ antialias: false }}
      camera={{ fov: 45, near: 0.1, far: 120, position: [0, 8, 10] }}
      onCreated={({ gl }) => {
        gl.setClearColor('#0b1020');
      }}
    >
      <ambientLight intensity={1.25} />
      <hemisphereLight args={['#cfe0ff', '#1a1f2e', 0.6]} />
      <directionalLight position={[6, 12, 8]} intensity={1.2} />
      <CameraRig plan={plan} />
      <Floor plan={plan} highlight={highlight} highlightValid={highlightValid} />
      <Walls plan={plan} />
      <Furniture plan={plan} placements={placements} selectedId={selectedId} />
    </Canvas>
  );
}

/** Rekent een tik door naar een cel, of null buiten de kamer. */
export function tapToCell(
  plan: FloorPlan,
  screenX: number,
  screenY: number,
): { x: number; z: number } | null {
  const floor = screenToFloor(screenX, screenY);
  if (!floor) return null;
  const cellX = Math.floor(floor.x / HOME_CELL_SIZE + plan.width / 2);
  const cellZ = Math.floor(floor.z / HOME_CELL_SIZE + plan.depth / 2);
  if (cellX < 0 || cellZ < 0 || cellX >= plan.width || cellZ >= plan.depth) return null;
  return { x: cellX, z: cellZ };
}

export { rotatedFootprint };
