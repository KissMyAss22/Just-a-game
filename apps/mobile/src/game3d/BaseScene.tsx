import {
  ECONOMY,
  HOME_CELL_SIZE,
  HOME_WALL_HEIGHT,
  doorCell,
  homeCellToWorld,
  homeEntrance,
  itemHeight,
  placedItemCenter,
  resolveHomeMovement,
  rotatedFootprint,
  worldToHomeCell,
  type FloorPlan,
  type PlacedItem,
} from '@game/shared';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { DAY_PALETTE, createEnvironment } from './city/sky';
import { interiorScale, itemGeometry } from './city/itemModels';
import { ACCENT_COLORS, OUTFIT_COLORS, SKIN_TONES } from '@game/shared';
import { createCharacter } from './city/character';
import { homeFocus, homePosition } from '../state/homePosition';
import { moveInput } from '../state/position';
import { useGame } from '../state/useGame';

/**
 * Muren op volle hoogte, want je staat er nu tussen.
 *
 * Dat kan alleen omdat een muur zichzelf wegzet zodra de camera aan de
 * buitenkant komt — zie `Walls`. Met halfhoge muurtjes zou het een poppenhuis
 * blijven, en dat was juist het punt om vanaf te komen.
 */
const WALL_HEIGHT = HOME_WALL_HEIGHT;
const WALL_THICKNESS = 0.12;

/** Hoe ver je vooruit kijkt om te bepalen welk vakje je bedoelt. */
const REACH = HOME_CELL_SIZE * 0.75;

/**
 * De hoek waaronder je naar je woning kijkt, in radialen.
 *
 * Alleen de hoek: de afstand en de hoogte volgen uit de kamer zelf, want in een
 * krot wil je dichterbij staan dan in een landhuis. Veeg over het beeld om hem
 * te draaien; het scherm schrijft er rechtstreeks in.
 */
export const homeCameraState = { yaw: Math.PI * 0.15 };

function CameraRig({ plan }: { plan: FloorPlan }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    // Bij een grote woning een stapje verder naar achteren, anders sta je in
    // een landhuis nog steeds op je eigen schouder te kijken.
    const span = Math.max(plan.width, plan.depth) * HOME_CELL_SIZE;
    const distance = Math.min(6.5, 3.4 + span * 0.16);
    const height = Math.min(5.2, 2.6 + span * 0.13);

    target.current.set(
      homePosition.x + Math.sin(homeCameraState.yaw) * distance,
      height,
      homePosition.z + Math.cos(homeCameraState.yaw) * distance,
    );
    camera.position.lerp(target.current, 1 - Math.pow(0.0022, Math.min(delta, 0.05)));
    look.current.set(homePosition.x, 0.9, homePosition.z);
    camera.lookAt(look.current);
  });

  return null;
}

/**
 * Jij, in je eigen woning.
 *
 * Hetzelfde figuurtje als in de stad, dezelfde joystick, dezelfde manier om
 * botsingen op te lossen — alleen dan met `resolveHomeMovement`, die muren en
 * meubels kent in plaats van gebouwen.
 */
function Player({
  plan,
  placements,
}: {
  plan: FloorPlan;
  placements: readonly PlacedItem[];
}) {
  const { scene } = useThree();
  const state = useGame((s) => s.state);
  const appearance = state?.player.appearance;

  const character = useMemo(() => createCharacter({ skin: '#c89066', outfit: '#2f6f5e', accent: '#e0b64a' }), []);

  useEffect(() => {
    scene.add(character.group);
    return () => {
      scene.remove(character.group);
      character.dispose();
    };
  }, [scene, character]);

  useEffect(() => {
    if (!appearance) return;
    character.setColors({
      skin: SKIN_TONES[appearance.skin] ?? '#c89066',
      outfit: OUTFIT_COLORS[appearance.outfit] ?? '#2f6f5e',
      accent: ACCENT_COLORS[appearance.accent] ?? '#e0b64a',
    });
  }, [character, appearance]);

  // Bij het openen van het scherm bij de deur beginnen.
  useEffect(() => {
    const entrance = homeEntrance(plan);
    homePosition.x = entrance.x;
    homePosition.z = entrance.z;
    // Met je rug naar de deur, dus de kamer in kijken.
    homePosition.facing = Math.PI;
    character.group.position.set(entrance.x, 0.06, entrance.z);
  }, [plan, character]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const yaw = homeCameraState.yaw;

    // Binnen loop je rustiger dan op straat; anders schiet je in twee tellen
    // van muur tot muur.
    const speed = ECONOMY.baseMoveSpeed * 0.55;
    const forward = moveInput.y;
    const strafe = moveInput.x;
    const magnitude = Math.min(1, Math.hypot(forward, strafe));

    if (magnitude > 0.02) {
      // Dezelfde omrekening als buiten: de joystick is relatief aan waar de
      // camera naartoe kijkt, niet aan de wereld.
      const dirX = Math.sin(yaw) * -forward + Math.cos(yaw) * strafe;
      const dirZ = Math.cos(yaw) * -forward - Math.sin(yaw) * strafe;
      const length = Math.hypot(dirX, dirZ) || 1;
      const step = speed * magnitude * delta;
      const next = resolveHomeMovement(
        plan,
        placements,
        homePosition.x,
        homePosition.z,
        homePosition.x + (dirX / length) * step,
        homePosition.z + (dirZ / length) * step,
      );
      homePosition.x = next.x;
      homePosition.z = next.z;
      homePosition.facing = Math.atan2(dirX, dirZ);
    }

    character.group.position.x = homePosition.x;
    character.group.position.z = homePosition.z;
    character.group.rotation.y = homePosition.facing;
    // De vloertegels liggen een paar centimeter dik; daar bovenop staan.
    character.group.position.y = 0.06;
    character.update(delta, magnitude * speed, 0, 0);

    // Waar kijk je naartoe? Een stap vooruit vanaf waar je staat.
    const aheadX = homePosition.x + Math.sin(homePosition.facing) * REACH;
    const aheadZ = homePosition.z + Math.cos(homePosition.facing) * REACH;
    homeFocus.cell = worldToHomeCell(plan, aheadX, aheadZ);
    homeFocus.placementId =
      placements.find((placed) => {
        const box = placedItemCenter(plan, placed);
        return (
          Math.abs(aheadX - box.x) < box.width / 2 && Math.abs(aheadZ - box.z) < box.depth / 2
        );
      })?.id ?? null;
  });

  return null;
}

/**
 * De muren, op volle hoogte.
 *
 * Een muur tussen de camera en jou zou het beeld dichtzetten, dus elke muur
 * verdwijnt zodra de camera aan zijn buitenkant komt. Dat is wat een kamer op
 * ware hoogte mogelijk maakt zonder dat je jezelf kwijtraakt — en het is
 * precies wat je in elk spel met binnenruimtes ziet gebeuren.
 */
function Walls({ plan }: { plan: FloorPlan }) {
  const width = plan.width * HOME_CELL_SIZE;
  const depth = plan.depth * HOME_CELL_SIZE;
  const door = doorCell(plan);
  const doorWorld = homeCellToWorld(plan, door.x, door.z);

  const north = useRef<THREE.Mesh>(null);
  const south = useRef<THREE.Group>(null);
  const west = useRef<THREE.Mesh>(null);
  const east = useRef<THREE.Mesh>(null);

  useFrame(({ camera }) => {
    // Een marge, zodat een muur niet gaat knipperen als de camera er precies
    // op ligt.
    const margin = 0.4;
    if (north.current) north.current.visible = camera.position.z > -depth / 2 - margin;
    if (south.current) south.current.visible = camera.position.z < depth / 2 + margin;
    if (west.current) west.current.visible = camera.position.x > -width / 2 - margin;
    if (east.current) east.current.visible = camera.position.x < width / 2 + margin;
  });

  return (
    <group>
      <mesh ref={north} position={[0, WALL_HEIGHT / 2, -depth / 2]} receiveShadow castShadow>
        <boxGeometry args={[width + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color={plan.wallColor} roughness={0.9} metalness={0} />
      </mesh>
      <mesh ref={west} position={[-width / 2, WALL_HEIGHT / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, depth]} />
        <meshStandardMaterial color={plan.wallColor} roughness={0.9} metalness={0} />
      </mesh>
      <mesh ref={east} position={[width / 2, WALL_HEIGHT / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, depth]} />
        <meshStandardMaterial color={plan.wallColor} roughness={0.9} metalness={0} />
      </mesh>

      {/* De voormuur heeft een gat waar de deur zit. */}
      <group ref={south}>
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
        {/* Een deurpost, zodat de opening als een deur leest en niet als een gat. */}
        {[-1, 1].map((side) => (
          <mesh
            key={`post${side}`}
            position={[doorWorld.x + (side * HOME_CELL_SIZE) / 2, WALL_HEIGHT / 2, depth / 2]}
            castShadow
          >
            <boxGeometry args={[0.1, WALL_HEIGHT, WALL_THICKNESS * 1.6]} />
            <meshStandardMaterial color="#3c3630" roughness={0.8} />
          </mesh>
        ))}
      </group>
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

/**
 * Eén materiaal voor al het meubilair; de kleuren zitten in de punten van het
 * model zelf. Het geselecteerde voorwerp krijgt een eigen exemplaar, want een
 * gloed hoort bij één ding en niet bij de hele kamer.
 */
const FURNITURE_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.55,
  metalness: 0.12,
});
const FURNITURE_SELECTED = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.55,
  metalness: 0.12,
  emissive: new THREE.Color('#4dd4ac'),
  emissiveIntensity: 0.45,
});

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
        const box = placedItemCenter(plan, placed);
        const selected = placed.id === selectedId;
        const scale = interiorScale(placed.itemId, placed.rotation, HOME_CELL_SIZE);
        return (
          <group key={placed.id} position={[box.x, 0.06, box.z]}>
            <mesh
              geometry={itemGeometry(placed.itemId)}
              material={selected ? FURNITURE_SELECTED : FURNITURE_MATERIAL}
              scale={scale}
              rotation-y={(placed.rotation * Math.PI) / 2}
              castShadow
              receiveShadow
            />
            {/* Ring om het geselecteerde voorwerp. */}
            {selected ? (
              <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
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
  /** De schim van wat je op het punt staat neer te zetten. */
  ghost: { itemId: string; rotation: number } | null;
}

/**
 * Waar je het item neerzet dat je vasthoudt, voordat je bevestigt.
 *
 * Half doorzichtig en in de kleur van de tegel eronder — groen als het past,
 * rood als het niet past. Zo zie je het formaat vóórdat je hem kwijt bent.
 */
function Ghost({
  plan,
  cell,
  ghost,
  valid,
}: {
  plan: FloorPlan;
  cell: { x: number; z: number } | null;
  ghost: { itemId: string; rotation: number } | null;
  valid: boolean;
}) {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.55,
        roughness: 0.6,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  if (!ghost || !cell) return null;

  const { w, d } = rotatedFootprint(ghost.itemId, ghost.rotation);
  const first = homeCellToWorld(plan, cell.x, cell.z);
  const x = first.x + ((w - 1) * HOME_CELL_SIZE) / 2;
  const z = first.z + ((d - 1) * HOME_CELL_SIZE) / 2;
  const scale = interiorScale(ghost.itemId, ghost.rotation, HOME_CELL_SIZE);

  return (
    <group position={[x, 0.06, z]}>
      <mesh
        geometry={itemGeometry(ghost.itemId)}
        material={material}
        scale={scale}
        rotation-y={(ghost.rotation * Math.PI) / 2}
      />
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[HOME_CELL_SIZE * 0.38, HOME_CELL_SIZE * 0.46, 24]} />
        <meshBasicMaterial color={valid ? '#4dd4ac' : '#ff6b6b'} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function BaseScene({
  plan,
  placements,
  selectedId,
  highlight,
  highlightValid,
  ghost,
}: BaseSceneProps) {
  const [hasEnvironment, setHasEnvironment] = useState(true);

  return (
    <Canvas
      gl={{ antialias: true }}
      shadows={{ type: THREE.PCFShadowMap }}
      camera={{ fov: 52, near: 0.1, far: 120, position: [0, 4, 6] }}
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
      <Player plan={plan} placements={placements} />
      <Floor plan={plan} highlight={highlight} highlightValid={highlightValid} />
      <Walls plan={plan} />
      <Furniture plan={plan} placements={placements} selectedId={selectedId} />
      <Ghost plan={plan} cell={highlight} ghost={ghost} valid={highlightValid} />
    </Canvas>
  );
}

export { rotatedFootprint };
