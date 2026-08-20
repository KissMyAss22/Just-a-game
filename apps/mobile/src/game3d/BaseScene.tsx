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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { rarityColor } from '../ui/theme';
import { getItem } from '@game/shared';
import { DAY_PALETTE, createEnvironment } from './city/sky';

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
      <mesh position={[0, WALL_HEIGHT / 2, -depth / 2]} receiveShadow castShadow>
        <boxGeometry args={[width + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color={plan.wallColor} roughness={0.9} metalness={0} />
      </mesh>
      <mesh position={[-width / 2, WALL_HEIGHT / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, depth]} />
        <meshStandardMaterial color={plan.wallColor} roughness={0.9} metalness={0} />
      </mesh>
      <mesh position={[width / 2, WALL_HEIGHT / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, depth]} />
        <meshStandardMaterial color={plan.wallColor} roughness={0.9} metalness={0} />
      </mesh>

      {/* De voormuur heeft een gat waar de deur zit. */}
      {[-1, 1].map((side) => {
        const segment = width / 2 - HOME_CELL_SIZE / 2;
        if (segment <= 0.01) return null;
        const center = doorWorld.x + side * (HOME_CELL_SIZE / 2 + segment / 2);
        return (
          <mesh key={side} position={[center, WALL_HEIGHT / 2, depth / 2]} receiveShadow castShadow>
            <boxGeometry args={[segment, WALL_HEIGHT, WALL_THICKNESS]} />
            <meshStandardMaterial color={plan.wallColor} roughness={0.9} metalness={0} />
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

const TILE_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const tileDummy = new THREE.Object3D();
const tileColor = new THREE.Color();

/**
 * De vloer is één instanced mesh. Een aparte mesh per tegel gaf bij een groot
 * huis tientallen tekenopdrachten voor iets wat vrijwel nooit verandert.
 */
function Floor({ plan, highlight, highlightValid }: FloorProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = plan.width * plan.depth;
  const door = useMemo(() => doorCell(plan), [plan]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let index = 0;
    for (let z = 0; z < plan.depth; z++) {
      for (let x = 0; x < plan.width; x++) {
        const world = homeCellToWorld(plan, x, z);
        const isDoor = x === door.x && z === door.z;
        const isHighlight = highlight?.x === x && highlight?.z === z;
        tileDummy.position.set(world.x, isHighlight ? 0.03 : 0, world.z);
        tileDummy.scale.set(HOME_CELL_SIZE * 0.97, 0.06, HOME_CELL_SIZE * 0.97);
        tileDummy.rotation.set(0, 0, 0);
        tileDummy.updateMatrix();
        mesh.setMatrixAt(index, tileDummy.matrix);
        mesh.setColorAt(
          index,
          tileColor.set(
            isHighlight ? (highlightValid ? '#4dd4ac' : '#ff6b6b') : isDoor ? '#2a2f3a' : plan.floorColor,
          ),
        );
        index++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [plan, door, highlight?.x, highlight?.z, highlightValid, count]);

  return (
    <instancedMesh ref={ref} args={[TILE_GEOMETRY, undefined, count]} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.72} metalness={0.02} />
    </instancedMesh>
  );
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
            <mesh position={[0, height / 2 + 0.06, 0]} castShadow receiveShadow>
              <boxGeometry args={[box.width * 0.82, height, box.depth * 0.82]} />
              <meshStandardMaterial
                color={rarityColor[item.rarity] ?? '#9ca3af'}
                roughness={0.45}
                metalness={0.15}
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

/**
 * Dezelfde omgevingstextuur als buiten. Zonder omgeving zien de materialen in
 * huis er wezenlijk anders uit dan in de stad, en dat valt meteen op als je
 * heen en weer loopt.
 */
function Environment({ onResult }: { onResult: (ok: boolean) => void }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const texture = createEnvironment(gl, DAY_PALETTE);
    onResult(Boolean(texture));
    if (!texture) return;
    scene.environment = texture;
    return () => {
      scene.environment = null;
      texture.dispose();
    };
  }, [gl, scene, onResult]);
  return null;
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
  const [hasEnvironment, setHasEnvironment] = useState(true);

  return (
    <Canvas
      gl={{ antialias: true }}
      shadows={{ type: THREE.PCFShadowMap }}
      camera={{ fov: 45, near: 0.1, far: 120, position: [0, 8, 10] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.0;
        gl.setClearColor('#0b1020');
      }}
    >
      <Environment onResult={setHasEnvironment} />
      {/* Zonder omgevingstextuur valt het diffuse licht grotendeels weg; dan
          moet het hemellicht dat opvangen. Zie city/world.ts. */}
      <hemisphereLight args={['#e2ecff', '#2a2620', hasEnvironment ? 0.5 : 1.4]} />
      <directionalLight
        position={[7, 13, 6]}
        intensity={2.2}
        color="#fff2dd"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.001}
        shadow-normalBias={0.02}
      />
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
