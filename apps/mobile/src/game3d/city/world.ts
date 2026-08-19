import {
  buildChunk,
  chunkAtWorld,
  chunkKey,
  chunksAround,
  streetPropsIn,
  treesOnLot,
  type ChunkContent,
  type StreetProp,
} from '@game/shared';
import * as THREE from 'three';
import { buildChunkObject, disposeChunkObject } from './chunkMesh';
import { createPropField, type PropField } from './props';
import { QUALITY, type QualityLevel } from './quality';
import { DAY_PALETTE, createEnvironment, createSkyDome, type SkyDome } from './sky';

/**
 * De hele buitenwereld in één object: lucht, licht, straten en meubilair.
 *
 * Alles wat elke frame moet gebeuren staat in `update`. Dat is bewust geen
 * React: de stad verandert pas als je een chunk verder loopt, en de zon en de
 * lucht hoeven alleen mee te schuiven. Zou dit uit componenten bestaan, dan
 * zou React zestig keer per seconde een boom vergelijken die vrijwel nooit
 * verandert.
 */

const CHUNK_CACHE = new Map<string, ChunkContent>();

function chunkContent(chunkX: number, chunkZ: number): ChunkContent {
  const key = chunkKey(chunkX, chunkZ);
  const cached = CHUNK_CACHE.get(key);
  if (cached) return cached;
  const built = buildChunk(chunkX, chunkZ);
  CHUNK_CACHE.set(key, built);
  return built;
}

/** Hoeveel chunks rond de speler in beeld staan (1 = 3x3 = 384 m). */
const VIEW_RANGE = 1;
/** Zoveel meter mag de speler lopen voordat het meubilair opnieuw wordt gezet. */
const PROP_REFRESH_DISTANCE = 25;

export interface World {
  root: THREE.Group;
  sun: THREE.DirectionalLight;
  update: (camera: THREE.Camera, elapsed: number, playerX: number, playerZ: number) => void;
  dispose: () => void;
}

export function createWorld(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  level: QualityLevel,
): World {
  const settings = QUALITY[level];
  const root = new THREE.Group();

  const environment = createEnvironment(renderer, DAY_PALETTE);
  if (environment) scene.environment = environment;
  scene.fog = new THREE.Fog(new THREE.Color(DAY_PALETTE.haze), settings.fogNear, settings.fogFar);

  const sky: SkyDome = createSkyDome(DAY_PALETTE);
  root.add(sky.mesh);

  const sun = new THREE.DirectionalLight(
    new THREE.Color(DAY_PALETTE.sunLight),
    DAY_PALETTE.sunIntensity,
  );
  sun.castShadow = settings.shadows;
  sun.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
  sun.shadow.camera.left = -settings.shadowRadius;
  sun.shadow.camera.right = settings.shadowRadius;
  sun.shadow.camera.top = settings.shadowRadius;
  sun.shadow.camera.bottom = -settings.shadowRadius;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 420;
  // Zonder deze bias krijgen platte vlakken strepen ("shadow acne").
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.04;
  root.add(sun);
  root.add(sun.target);

  root.add(
    new THREE.HemisphereLight(
      new THREE.Color(DAY_PALETTE.skyLight),
      new THREE.Color(DAY_PALETTE.groundLight),
      DAY_PALETTE.skyIntensity,
    ),
  );

  const chunkQuality = { castShadow: settings.shadows, receiveShadow: settings.shadows };
  const loaded = new Map<string, THREE.Group>();
  const props: PropField = createPropField(
    settings.shadows && settings.propShadows,
    settings.propRange,
  );
  root.add(props.group);

  let lastChunk = { chunkX: Number.NaN, chunkZ: Number.NaN };
  let lastPropX = Number.POSITIVE_INFINITY;
  let lastPropZ = Number.POSITIVE_INFINITY;
  const greenLots: { x: number; z: number; size: number }[] = [];
  const propBuffer: StreetProp[] = [];

  function refreshChunks(playerX: number, playerZ: number): void {
    const wanted = new Set<string>();
    greenLots.length = 0;
    for (const { chunkX, chunkZ } of chunksAround(playerX, playerZ, VIEW_RANGE)) {
      const content = chunkContent(chunkX, chunkZ);
      wanted.add(content.key);
      greenLots.push(...content.green);
      if (!loaded.has(content.key)) {
        const object = buildChunkObject(content, chunkQuality);
        loaded.set(content.key, object);
        root.add(object);
      }
    }
    for (const [key, object] of loaded) {
      if (wanted.has(key)) continue;
      root.remove(object);
      disposeChunkObject(object);
      loaded.delete(key);
    }
  }

  function refreshProps(playerX: number, playerZ: number): void {
    const reach = 160 * settings.propRange;
    propBuffer.length = 0;
    propBuffer.push(
      ...streetPropsIn(playerX - reach, playerZ - reach, playerX + reach, playerZ + reach),
    );
    for (const lot of greenLots) propBuffer.push(...treesOnLot(lot.x, lot.z, lot.size));
    props.update(propBuffer, playerX, playerZ);
  }

  return {
    root,
    sun,
    update(camera, elapsed, playerX, playerZ) {
      sky.update(camera, elapsed);

      const chunk = chunkAtWorld(playerX, playerZ);
      if (chunk.chunkX !== lastChunk.chunkX || chunk.chunkZ !== lastChunk.chunkZ) {
        lastChunk = chunk;
        refreshChunks(playerX, playerZ);
        lastPropX = Number.POSITIVE_INFINITY;
      }

      if (Math.hypot(playerX - lastPropX, playerZ - lastPropZ) > PROP_REFRESH_DISTANCE) {
        lastPropX = playerX;
        lastPropZ = playerZ;
        refreshProps(playerX, playerZ);
      }

      // De schaduwcamera dekt maar een klein stuk; die moet de speler volgen,
      // anders staat de schaduw ergens in een andere wijk.
      sun.target.position.set(playerX, 0, playerZ);
      sun.target.updateMatrixWorld();
      sun.position.set(
        playerX + DAY_PALETTE.sunDirection.x * 150,
        DAY_PALETTE.sunDirection.y * 150,
        playerZ + DAY_PALETTE.sunDirection.z * 150,
      );
    },
    dispose() {
      for (const object of loaded.values()) disposeChunkObject(object);
      loaded.clear();
      props.dispose();
      sky.dispose();
      environment?.dispose();
    },
  };
}
