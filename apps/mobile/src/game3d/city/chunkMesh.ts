import {
  ASPHALT_HALF_WIDTH,
  CITY,
  valueAt,
  ROAD_CENTER_OFFSET,
  ROAD_PERIOD,
  SIDEWALK_HEIGHT,
  isParkCell,
  isWaterCell,
  parkLandIn,
  worldToCell,
  type ChunkContent,
} from '@game/shared';
import * as THREE from 'three';
import {
  createContactShadowMaterial,
  createFacadeMaterial,
  createGrassMaterial,
  createRoadMaterial,
  createSidewalkMaterial,
  createWaterMaterial,
} from './materials';

/**
 * Bouwt de 3D-inhoud van één chunk als een gewone three-groep.
 *
 * Bewust géén React-componenten: de stad verandert alleen als je een chunk
 * verder loopt, en dan wil je één keer een groep bouwen in plaats van elke
 * frame een boom van componenten te vergelijken. Het maakt de scene ook
 * testbaar buiten de app om — zie scripts/render-preview.mjs.
 */

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

/** Materialen zijn duur om te compileren, dus ze worden gedeeld. */
const roadMaterials = new Map<string, THREE.MeshStandardMaterial>();
let sidewalkMaterial: THREE.MeshStandardMaterial | null = null;
let grassMaterial: THREE.MeshStandardMaterial | null = null;
let facadeMaterial: THREE.MeshStandardMaterial | null = null;
let waterMaterial: THREE.MeshStandardMaterial | null = null;
let contactMaterial: THREE.MeshBasicMaterial | null = null;
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

function roadMaterialFor(color: string): THREE.MeshStandardMaterial {
  const existing = roadMaterials.get(color);
  if (existing) return existing;
  const created = createRoadMaterial(color);
  roadMaterials.set(color, created);
  return created;
}

export function sharedFacadeMaterial(): THREE.MeshStandardMaterial {
  facadeMaterial ??= createFacadeMaterial();
  return facadeMaterial;
}

export function sharedWaterMaterial(): THREE.MeshStandardMaterial {
  waterMaterial ??= createWaterMaterial();
  return waterMaterial;
}

export interface ChunkQuality {
  /** Werpen gebouwen en meubilair een schaduw? */
  castShadow: boolean;
  /** Vangt de grond schaduwen op? */
  receiveShadow: boolean;
}

interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/**
 * De stoep is geen strook langs de weg maar een plateau over het hele
 * bouwblok. Dat scheelt geometrie en klopt ook beter: binnenterreinen liggen
 * even hoog als het trottoir, alleen het rijdek ligt lager.
 */
function plateauSpans(min: number, max: number): [number, number][] {
  const spans: [number, number][] = [];
  const first = Math.floor((min - ROAD_CENTER_OFFSET - ASPHALT_HALF_WIDTH) / ROAD_PERIOD) - 1;
  const last = Math.ceil((max - ROAD_CENTER_OFFSET) / ROAD_PERIOD) + 1;
  for (let k = first; k <= last; k++) {
    const start = k * ROAD_PERIOD + ROAD_CENTER_OFFSET + ASPHALT_HALF_WIDTH;
    const end = (k + 1) * ROAD_PERIOD + ROAD_CENTER_OFFSET - ASPHALT_HALF_WIDTH;
    const clippedStart = Math.max(start, min);
    const clippedEnd = Math.min(end, max);
    if (clippedEnd - clippedStart > 0.05) spans.push([clippedStart, clippedEnd]);
  }
  return spans;
}

function isWaterAt(x: number, z: number): boolean {
  const { cx, cz } = worldToCell(x, z);
  return isWaterCell(cx, cz);
}

/** Deelt een blok op in cellen zodra er water in zit, en laat dat water weg. */
function pushPlateau(out: Rect[], rect: Rect): void {
  const corners: [number, number][] = [
    [rect.minX + 0.5, rect.minZ + 0.5],
    [rect.maxX - 0.5, rect.minZ + 0.5],
    [rect.minX + 0.5, rect.maxZ - 0.5],
    [rect.maxX - 0.5, rect.maxZ - 0.5],
    [(rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2],
  ];
  const wet = corners.filter(([x, z]) => isWaterAt(x, z)).length;
  if (wet === 0) {
    out.push(rect);
    return;
  }
  if (wet === corners.length) return;

  const step = CITY.cellSize;
  for (let z = rect.minZ; z < rect.maxZ - 0.05; z += step) {
    for (let x = rect.minX; x < rect.maxX - 0.05; x += step) {
      const maxX = Math.min(x + step, rect.maxX);
      const maxZ = Math.min(z + step, rect.maxZ);
      if (isWaterAt((x + maxX) / 2, (z + maxZ) / 2)) continue;
      out.push({ minX: x, minZ: z, maxX, maxZ });
    }
  }
}

function buildSidewalk(content: ChunkContent, quality: ChunkQuality): THREE.Object3D | null {
  const minX = content.centerX - content.size / 2;
  const minZ = content.centerZ - content.size / 2;
  const maxX = minX + content.size;
  const maxZ = minZ + content.size;

  const rects: Rect[] = [];
  for (const [x0, x1] of plateauSpans(minX, maxX)) {
    for (const [z0, z1] of plateauSpans(minZ, maxZ)) {
      pushPlateau(rects, { minX: x0, minZ: z0, maxX: x1, maxZ: z1 });
    }
  }
  if (rects.length === 0) return null;

  sidewalkMaterial ??= createSidewalkMaterial();
  const mesh = new THREE.InstancedMesh(UNIT_BOX, sidewalkMaterial, rects.length);
  const dummy = new THREE.Object3D();
  const height = SIDEWALK_HEIGHT + 0.02;
  rects.forEach((rect, index) => {
    dummy.position.set((rect.minX + rect.maxX) / 2, height / 2 - 0.02, (rect.minZ + rect.maxZ) / 2);
    dummy.scale.set(rect.maxX - rect.minX, height, rect.maxZ - rect.minZ);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = quality.receiveShadow;
  mesh.castShadow = false;
  mesh.computeBoundingSphere();
  return mesh;
}

function buildGreen(content: ChunkContent, quality: ChunkQuality): THREE.Object3D | null {
  if (content.green.length === 0) return null;
  grassMaterial ??= createGrassMaterial();
  const mesh = new THREE.InstancedMesh(UNIT_BOX, grassMaterial, content.green.length);
  const dummy = new THREE.Object3D();
  content.green.forEach((lot, index) => {
    const height = 0.12;
    dummy.position.set(lot.x, SIDEWALK_HEIGHT + height / 2 - 0.03, lot.z);
    dummy.scale.set(lot.size, height, lot.size);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = quality.receiveShadow;
  mesh.computeBoundingSphere();
  return mesh;
}

function buildWater(content: ChunkContent): THREE.Object3D | null {
  if (content.water.length === 0) return null;
  const mesh = new THREE.InstancedMesh(UNIT_BOX, sharedWaterMaterial(), content.water.length);
  const dummy = new THREE.Object3D();
  content.water.forEach((cell, index) => {
    dummy.position.set(cell.x, -0.55, cell.z);
    dummy.scale.set(cell.size, 1.2, cell.size);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/**
 * Panden. Een toren met terugsprong wordt twee instances: een onderbouw en een
 * smallere toren daarboven. De shader krijgt via aInfo.z door hoe hoog de
 * onderbouw was, zodat de verdiepingen doorlopen in plaats van opnieuw te
 * beginnen.
 */
function buildBuildings(content: ChunkContent, quality: ChunkQuality): THREE.Object3D | null {
  if (content.buildings.length === 0) return null;

  const boxes: {
    x: number;
    z: number;
    baseY: number;
    width: number;
    height: number;
    depth: number;
    color: THREE.Color;
    seed: number;
    floors: number;
    offset: number;
    facade: number;
  }[] = [];

  for (const lot of content.buildings) {
    const color = new THREE.Color(lot.color);
    // De tweede vleugel van een hoekpand: zelfde hoogte, kleur en gevelsoort,
    // zodat de L als één gebouw leest.
    if (lot.wing) {
      boxes.push({
        x: lot.wing.centerX,
        z: lot.wing.centerZ,
        baseY: SIDEWALK_HEIGHT,
        width: lot.wing.width,
        height: lot.height,
        depth: lot.wing.depth,
        color,
        seed: lot.seed,
        floors: lot.floors,
        offset: 0,
        facade: lot.facadeCode,
      });
    }
    if (lot.setback > 0) {
      const podium = lot.height * lot.setback;
      boxes.push({
        x: lot.centerX,
        z: lot.centerZ,
        baseY: SIDEWALK_HEIGHT,
        width: lot.width,
        height: podium,
        depth: lot.depth,
        color,
        seed: lot.seed,
        floors: lot.floors,
        offset: 0,
        facade: lot.facadeCode,
      });
      boxes.push({
        x: lot.centerX,
        z: lot.centerZ,
        baseY: SIDEWALK_HEIGHT + podium,
        width: lot.width * 0.74,
        height: lot.height - podium,
        depth: lot.depth * 0.74,
        color,
        seed: lot.seed,
        floors: lot.floors,
        offset: podium,
        facade: lot.facadeCode,
      });
    } else {
      boxes.push({
        x: lot.centerX,
        z: lot.centerZ,
        baseY: SIDEWALK_HEIGHT,
        width: lot.width,
        height: lot.height,
        depth: lot.depth,
        color,
        seed: lot.seed,
        floors: lot.floors,
        offset: 0,
        facade: lot.facadeCode,
      });
    }
  }

  const geometry = UNIT_BOX.clone();
  // three past de instance-kleur alleen toe als de shader USE_COLOR heeft, en
  // dat gebeurt pas als de geometrie zelf een kleurattribuut heeft. Zonder dit
  // witte attribuut blijft `vertexColors` aan staan met een lege attribuut, en
  // wordt elke gevel zwart.
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(new Float32Array(UNIT_BOX.attributes.position!.count * 3).fill(1), 3),
  );
  const sizes = new Float32Array(boxes.length * 3);
  const info = new Float32Array(boxes.length * 4);
  const mesh = new THREE.InstancedMesh(geometry, sharedFacadeMaterial(), boxes.length);
  const dummy = new THREE.Object3D();

  boxes.forEach((box, index) => {
    dummy.position.set(box.x, box.baseY + box.height / 2, box.z);
    dummy.scale.set(box.width, box.height, box.depth);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, box.color);
    sizes.set([box.width, box.height, box.depth], index * 3);
    info.set([box.seed, box.floors, box.offset, box.facade], index * 4);
  });

  geometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(sizes, 3));
  geometry.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = quality.castShadow;
  mesh.receiveShadow = quality.receiveShadow;
  mesh.computeBoundingSphere();
  return mesh;
}

/**
 * Dakopbouwen: liftschacht, trappenhuis, installaties. Vanaf de straat zie je
 * er weinig van, maar ze halen de kartonnen-doos-indruk van de skyline af.
 */
function buildRoofUnits(content: ChunkContent, quality: ChunkQuality): THREE.Object3D | null {
  const units: { x: number; y: number; z: number; w: number; h: number; d: number }[] = [];
  for (const lot of content.buildings) {
    if (lot.roofUnits === 0) continue;
    const top = SIDEWALK_HEIGHT + lot.height;
    const shrink = lot.setback > 0 ? 0.74 : 1;
    for (let i = 0; i < lot.roofUnits; i++) {
      const a = valueAt(CITY.seed + 40 + i, lot.anchorX, lot.anchorZ);
      const b = valueAt(CITY.seed + 50 + i, lot.anchorX, lot.anchorZ);
      const c = valueAt(CITY.seed + 60 + i, lot.anchorX, lot.anchorZ);
      const w = (1.4 + a * 2.6) * shrink;
      const d = (1.4 + b * 2.2) * shrink;
      const h = 0.9 + c * 2.0;
      units.push({
        x: lot.centerX + (a - 0.5) * lot.width * shrink * 0.5,
        y: top + h / 2,
        z: lot.centerZ + (b - 0.5) * lot.depth * shrink * 0.5,
        w,
        h,
        d,
      });
    }
  }
  if (units.length === 0) return null;

  sidewalkMaterial ??= createSidewalkMaterial();
  const mesh = new THREE.InstancedMesh(UNIT_BOX, sidewalkMaterial, units.length);
  const dummy = new THREE.Object3D();
  units.forEach((unit, index) => {
    dummy.position.set(unit.x, unit.y, unit.z);
    dummy.scale.set(unit.w, unit.h, unit.d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = quality.castShadow;
  mesh.receiveShadow = quality.receiveShadow;
  mesh.computeBoundingSphere();
  return mesh;
}

/** De donkere aanzet waar een gevel de stoep raakt. */
function buildContactShadows(content: ChunkContent): THREE.Object3D | null {
  if (content.buildings.length === 0) return null;
  contactMaterial ??= createContactShadowMaterial();
  const mesh = new THREE.InstancedMesh(UNIT_PLANE, contactMaterial, content.buildings.length);
  const dummy = new THREE.Object3D();
  content.buildings.forEach((lot, index) => {
    dummy.position.set(lot.centerX, SIDEWALK_HEIGHT + 0.012, lot.centerZ);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.scale.set(lot.width + 3.2, lot.depth + 3.2, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.renderOrder = 1;
  mesh.computeBoundingSphere();
  return mesh;
}

/**
 * Het park als plateau op stoephoogte.
 *
 * De stad ligt op het stoepplateau en alleen het rijdek ligt in een geul
 * daaronder; `groundHeightAt` zegt dat ook. Het park is land en hoort dus even
 * hoog te liggen, anders zweeft alles wat erop staat er zestien centimeter
 * boven — percelen, ruïnes, meubilair en opgeraapte spullen rekenen allemaal
 * met die functie.
 *
 * Waarom niet gewoon het grondvlak van de chunk omhoog: dat vlak loopt door
 * over de zeecellen. Optillen dekte de zee af, en dan is de landtong ineens
 * een weiland. Daarom krijgt alleen het land een vorm, en die vorm komt uit
 * `parkLandIn` — dezelfde grenzen waar de server mee rekent.
 *
 * Een doos en geen vlak: de zijkant van het grasmateriaal is de aarde onder de
 * zode, en dat is precies wat je aan een oever wil zien.
 */
function buildParkPlateau(content: ChunkContent): THREE.Object3D | null {
  const half = content.size / 2;
  const rects = parkLandIn(
    content.centerX - half,
    content.centerZ - half,
    content.centerX + half,
    content.centerZ + half,
  );
  if (rects.length === 0) return null;

  grassMaterial ??= createGrassMaterial();
  const mesh = new THREE.InstancedMesh(UNIT_BOX, grassMaterial, rects.length);
  const dummy = new THREE.Object3D();
  const depth = 0.7;
  rects.forEach((rect, index) => {
    const width = rect.maxX - rect.minX;
    const length = rect.maxZ - rect.minZ;
    dummy.position.set(
      (rect.minX + rect.maxX) / 2,
      SIDEWALK_HEIGHT - depth / 2,
      (rect.minZ + rect.maxZ) / 2,
    );
    dummy.scale.set(width, depth, length);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

export function buildChunkObject(content: ChunkContent, quality: ChunkQuality): THREE.Group {
  const group = new THREE.Group();
  group.name = `chunk:${content.key}`;

  // In het park ligt gras in plaats van asfalt.
  //
  // Dat is een keuze van materiaal en geen shaderwijziging: de wegshader
  // tekent zijn rijbaan uit de wereldpositie, dus die zou ook in het park
  // straten trekken. Eén ander materiaal voor deze chunk lost dat op, en het
  // scheelt precies het soort GLSL-fout dat je pas op een telefoon ziet.
  const centre = worldToCell(content.centerX, content.centerZ);
  const isPark = isParkCell(centre.cx, centre.cz);

  // Let op de kanteling: die zit in de geométrie en niet in de mesh.
  //
  // Dat lijkt hetzelfde — voor het licht ís het hetzelfde, want de normaal
  // wordt toch met de mesh meegedraaid — maar de grasshader kijkt naar de
  // normaal in objectruimte om zode van aarde te scheiden. Bij een gekantelde
  // mesh staat die normaal in objectruimte nog steeds op +z, en dan is
  // `vObjNormal.y` nul: het hele park werd getekend als de kale aarde onder de
  // zode. Een vlak dat al plat ligt heeft die normaal wél omhoog.
  const groundGeometry = new THREE.PlaneGeometry(content.size, content.size);
  groundGeometry.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(
    groundGeometry,
    isPark ? (grassMaterial ??= createGrassMaterial()) : roadMaterialFor(content.groundColor),
  );
  ground.position.set(content.centerX, -0.02, content.centerZ);
  ground.receiveShadow = quality.receiveShadow;
  group.add(ground);

  for (const part of [
    buildWater(content),
    // Geen stoepranden in het park; die horen bij straten.
    isPark ? null : buildSidewalk(content, quality),
    // Het plateau vraagt bewust niet of dít een parkchunk is, maar of er park
    // in ligt: `isPark` kijkt naar het middelpunt van de chunk, en dat gaat
    // net goed zolang de parkgrenzen op chunkgrenzen vallen. Zo'n stilzwijgende
    // afhankelijkheid is precies wat er omvalt zodra de grenzen verschuiven.
    buildParkPlateau(content),
    buildGreen(content, quality),
    buildContactShadows(content),
    buildBuildings(content, quality),
    buildRoofUnits(content, quality),
  ]) {
    if (part) group.add(part);
  }

  return group;
}

/** Ruimt de geometrie van een chunk op; materialen blijven gedeeld staan. */
export function disposeChunkObject(group: THREE.Group): void {
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.geometry) return;
    if (mesh.geometry === UNIT_BOX || mesh.geometry === UNIT_PLANE) return;
    mesh.geometry.dispose();
  });
}
