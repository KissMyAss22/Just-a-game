import { ASPHALT_HALF_WIDTH, CITY, ROAD_CENTER_OFFSET, ROAD_PERIOD } from '@game/shared';
import * as THREE from 'three';
import { sharedNoise } from './noise';

/**
 * Alle materialen van de stad staan hier bij elkaar.
 *
 * Het belangrijkste idee: detail zit in de shader, niet in de geometrie. Een
 * gevel met duizend ruiten als losse vlakjes legt een telefoon plat; dezelfde
 * gevel als één blok waarop de fragmentshader het ramenpatroon uitrekent kost
 * niets extra's. Zo blijft de stad honderden panden groot en toch vloeiend.
 */

/**
 * Hoe donker het buiten is, 0..1. Eén object dat door alle materialen wordt
 * gedeeld: zo hoeft er bij het wisselen van de tijd niets doorgegeven te
 * worden aan tientallen shaders afzonderlijk.
 */
export const NIGHT_UNIFORM = { value: 0 };

/** Zet een getal om in een GLSL-float, zodat 64 niet als int wordt gelezen. */
const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : `${n}`);

const GLSL_HELPERS = /* glsl */ `
float roadAxisDistance(float v) {
  float u = mod(v - ${f(ROAD_CENTER_OFFSET)}, ${f(ROAD_PERIOD)});
  return min(u, ${f(ROAD_PERIOD)} - u);
}

float gridLine(float v, float sharpness) {
  float t = abs(fract(v) - 0.5) * 2.0;
  return smoothstep(sharpness, 1.0, t);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

/** Vult vWorldPos en vObjNormal, ook als de mesh instanced is. */
function injectWorldVaryings(shader: { vertexShader: string }): void {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
varying vec3 vWorldPos;
varying vec3 vObjNormal;`,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec4 gWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
#else
  vec4 gWorld = modelMatrix * vec4(transformed, 1.0);
#endif
vWorldPos = gWorld.xyz;
vObjNormal = normal;`,
    );
}

function fragmentHeader(shader: { fragmentShader: string }, extra = ''): void {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>
varying vec3 vWorldPos;
varying vec3 vObjNormal;
uniform sampler2D uNoise;
${extra}
${GLSL_HELPERS}`,
  );
}

/**
 * Alles wat de kleur, ruwheid en gloed aanpast gaat op één plek in de shader
 * staan: vlak voor de belichting wordt berekend. Daar is diffuseColor al klaar
 * en telt roughnessFactor nog mee.
 */
function injectSurface(shader: { fragmentShader: string }, body: string): void {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
${body}`,
  );
}

// ---------------------------------------------------------------------------
// Wegdek
// ---------------------------------------------------------------------------

/**
 * Het wegdek is één vlak per chunk. De shader weet zelf waar de straten
 * liggen — dezelfde formule als `isAsphalt` in @game/shared — en tekent daar
 * asfalt, middenstrepen en zebrapaden op.
 */
export function createRoadMaterial(groundColor: string): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(groundColor),
    roughness: 0.95,
    metalness: 0,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: sharedNoise() };
    injectWorldVaryings(shader);
    fragmentHeader(shader);
    injectSurface(
      shader,
      /* glsl */ `
{
  float dx = roadAxisDistance(vWorldPos.x);
  float dz = roadAxisDistance(vWorldPos.z);

  float grain = texture2D(uNoise, vWorldPos.xz * 0.09).r;
  float blotch = texture2D(uNoise, vWorldPos.xz * 0.016).r;
  vec3 asphalt = diffuseColor.rgb * (0.78 + grain * 0.30 + blotch * 0.16);

  // Middenstreep, maar niet op een kruising.
  float dashZ = step(mod(vWorldPos.z, 6.0), 3.2);
  float dashX = step(mod(vWorldPos.x, 6.0), 3.2);
  float centre = max(
    (1.0 - step(0.11, dx)) * dashZ * step(4.4, dz),
    (1.0 - step(0.11, dz)) * dashX * step(4.4, dx)
  );

  // Zebrapaden op de aanloop naar elke kruising.
  float zebraA = step(2.9, dz) * (1.0 - step(4.5, dz))
               * (1.0 - step(${f(ASPHALT_HALF_WIDTH)}, dx))
               * step(mod(vWorldPos.x, 0.95), 0.52);
  float zebraB = step(2.9, dx) * (1.0 - step(4.5, dx))
               * (1.0 - step(${f(ASPHALT_HALF_WIDTH)}, dz))
               * step(mod(vWorldPos.z, 0.95), 0.52);
  float paint = clamp(centre + zebraA + zebraB, 0.0, 1.0);
  // Verf slijt; anders ziet het eruit alsof het gisteren geschilderd is.
  paint *= 0.55 + grain * 0.45;

  diffuseColor.rgb = mix(asphalt, vec3(0.80, 0.78, 0.71), paint * 0.9);
  roughnessFactor = mix(0.96, 0.62, paint);
}
`,
    );
  };

  return material;
}

// ---------------------------------------------------------------------------
// Stoep
// ---------------------------------------------------------------------------

/**
 * De stoep ligt als een verhoogd plateau over het hele bouwblok. De bovenkant
 * krijgt tegelvoegen, de zijkanten worden de stoeprand.
 */
export function createSidewalkMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#6f6c65'),
    roughness: 0.9,
    metalness: 0,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: sharedNoise() };
    injectWorldVaryings(shader);
    fragmentHeader(shader);
    injectSurface(
      shader,
      /* glsl */ `
{
  float up = step(0.5, abs(vObjNormal.y));
  float grain = texture2D(uNoise, vWorldPos.xz * 0.13).r;
  float blotch = texture2D(uNoise, vWorldPos.xz * 0.021).r;
  float verweg = min(roadAxisDistance(vWorldPos.x), roadAxisDistance(vWorldPos.z));

  // Trottoir: tegels, lichter beton, alleen de eerste meters langs de straat.
  vec3 tile = diffuseColor.rgb * (0.92 + grain * 0.24 + blotch * 0.14);
  float joints = max(gridLine(vWorldPos.x / 1.15, 0.93), gridLine(vWorldPos.z / 1.15, 0.93));
  tile *= 1.0 - joints * 0.20;

  // Binnenterrein: geen trottoirtegels maar een verhard achtererf, met per
  // perceel een eigen tint. Zonder dat wordt een heel bouwblok een grijze plaat.
  float lotX = floor(vWorldPos.x / 16.0);
  float lotZ = floor(vWorldPos.z / 16.0);
  float lotTone = hash21(vec2(lotX, lotZ));
  vec3 yard = diffuseColor.rgb * (0.52 + lotTone * 0.42 + grain * 0.18 + blotch * 0.10);
  float lotSeam = max(gridLine(vWorldPos.x / 16.0, 0.985), gridLine(vWorldPos.z / 16.0, 0.985));
  yard *= 1.0 - lotSeam * 0.35;

  vec3 top = mix(tile, yard, smoothstep(5.4, 8.0, verweg));

  // De rand: donkerder beton, met een lichte bovenkant waar hij afgesleten is.
  vec3 kerb = diffuseColor.rgb * (0.70 + grain * 0.18);

  diffuseColor.rgb = mix(kerb, top, up);
  roughnessFactor = mix(0.82, 0.90, up);
}
`,
    );
  };

  return material;
}

// ---------------------------------------------------------------------------
// Groen
// ---------------------------------------------------------------------------

export function createGrassMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#465c33'),
    roughness: 1,
    metalness: 0,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: sharedNoise() };
    injectWorldVaryings(shader);
    fragmentHeader(shader);
    injectSurface(
      shader,
      /* glsl */ `
{
  float up = step(0.5, abs(vObjNormal.y));
  float fine = texture2D(uNoise, vWorldPos.xz * 0.55).r;
  float broad = texture2D(uNoise, vWorldPos.xz * 0.07).r;
  // Flink wat variatie: een egaal groen vlak leest als een voetbalveld.
  vec3 grass = diffuseColor.rgb * (0.50 + broad * 0.80) + vec3(0.06, 0.06, 0.012) * fine;
  grass *= 0.88 + gridLine(vWorldPos.x / 3.7, 0.80) * 0.10 + gridLine(vWorldPos.z / 4.3, 0.80) * 0.10;
  // De zijkant is aarde onder de zode.
  vec3 soil = vec3(0.24, 0.19, 0.14) * (0.8 + fine * 0.4);
  diffuseColor.rgb = mix(soil, grass, up);
}
`,
    );
  };

  return material;
}

// ---------------------------------------------------------------------------
// Gevels
// ---------------------------------------------------------------------------

/**
 * Eén materiaal voor alle panden. Per instance komen mee:
 *   aSize  = breedte, hoogte, diepte in meters
 *   aInfo  = seed (0..1), aantal verdiepingen, hoogte van de onderbouw
 *
 * De shader leidt daaruit verdiepingen, ramen, een plint en verlichte ruiten
 * af. De onderbouw-offset zorgt dat een toren met terugsprong zijn
 * verdiepingsindeling netjes voortzet in plaats van onderaan opnieuw te
 * beginnen.
 */
export function createFacadeMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.02,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: sharedNoise() };
    shader.uniforms.uNight = NIGHT_UNIFORM;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aSize;
attribute vec4 aInfo;
varying vec3 vLocalPos;
varying vec3 vObjNormal;
varying vec3 vSize;
varying vec4 vInfo;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vLocalPos = position * aSize;
vObjNormal = normal;
vSize = aSize;
vInfo = aInfo;`,
      );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vLocalPos;
varying vec3 vObjNormal;
varying vec3 vSize;
varying vec4 vInfo;
uniform sampler2D uNoise;
uniform float uNight;
${GLSL_HELPERS}`,
    );

    injectSurface(
      shader,
      /* glsl */ `
{
  float floorHeight = ${f(CITY.floorHeight)};
  float viewDist = length(vViewPosition);

  // Detail dat kleiner wordt dan een pixel gaat moireren. Daarom vervaagt fijn
  // werk (metselverband, naden) eerder dan grof werk (ramen), net zoals een
  // mipmap dat zou doen.
  float fineDetail = 1.0 - smoothstep(14.0, 42.0, viewDist);
  float detail = 1.0 - smoothstep(120.0, 300.0, viewDist);

  float style = vInfo.w;
  float isBrick = step(0.5, style) * (1.0 - step(1.5, style));
  float isCurtain = step(1.5, style) * (1.0 - step(2.5, style));
  float isPanel = step(2.5, style);
  float isPlaster = 1.0 - isBrick - isCurtain - isPanel;

  float roof = step(0.5, abs(vObjNormal.y));
  float height = vLocalPos.y + vSize.y * 0.5 + vInfo.z;
  float across = abs(vObjNormal.x) > 0.5 ? vLocalPos.z : vLocalPos.x;

  float columnWidth = isCurtain > 0.5 ? 1.70 : 2.55;
  float floorIndex = floor(height / floorHeight);
  float fy = fract(height / floorHeight);
  float columnIndex = floor(across / columnWidth);
  float fx = fract(across / columnWidth);

  float grain = texture2D(uNoise, vec2(across, height) * 0.14).r;
  float weather = texture2D(uNoise, vec2(across, height) * 0.031).r;

  // ---- muurvlak -----------------------------------------------------------
  vec3 base = diffuseColor.rgb * (0.74 + vInfo.x * 0.28 + grain * 0.12);
  base *= 0.90 + weather * 0.20;
  // Vuil en schaduw onderaan: gebouwen zijn nooit even schoon aan de voet.
  base *= 0.72 + 0.28 * smoothstep(0.0, 2.6, height);
  vec3 wall = base;

  // Metselwerk: lagen met halfsteens verband, elke steen net iets anders.
  float course = height / 0.115;
  float courseIndex = floor(course);
  float fCourse = fract(course);
  float stagger = mod(courseIndex, 2.0) * 0.5;
  float brickU = across / 0.24 + stagger;
  float brickIndex = floor(brickU);
  float joint = clamp(step(0.86, fCourse) + step(0.93, fract(brickU)), 0.0, 1.0);
  vec3 brick = base * (0.84 + hash21(vec2(brickIndex, courseIndex)) * 0.30);
  vec3 mortar = mix(base, vec3(0.62, 0.60, 0.56), 0.55);
  brick = mix(brick, mortar, joint * fineDetail * 0.75);
  wall = mix(wall, brick, isBrick);

  // Betonpanelen: brede platen met een zichtbare naad ertussen.
  float seam = clamp(
    step(0.965, fract(height / 1.6)) + step(0.972, fract(across / 1.9)),
    0.0, 1.0
  );
  vec3 panel = base * (0.92 + hash21(vec2(floor(across / 1.9), floor(height / 1.6))) * 0.14);
  panel = mix(panel, base * 0.62, seam * fineDetail);
  wall = mix(wall, panel, isPanel);

  // Vliesgevel: tussen de ruiten alleen nog donkere aluminium stijlen.
  wall = mix(wall, mix(base * 0.30, vec3(0.12, 0.13, 0.15), 0.6), isCurtain);

  // Een schaduwlijn op elke verdiepingsvloer geeft de gevel schaal.
  wall *= 1.0 - smoothstep(0.90, 1.0, fy) * 0.20 * (1.0 - isBrick);

  // ---- ramen --------------------------------------------------------------
  vec2 rowRange = isPlaster * vec2(0.26, 0.78)
                + isBrick   * vec2(0.24, 0.76)
                + isCurtain * vec2(0.07, 0.95)
                + isPanel   * vec2(0.30, 0.72);
  vec2 colRange = isPlaster * vec2(0.19, 0.81)
                + isBrick   * vec2(0.20, 0.80)
                + isCurtain * vec2(0.05, 0.95)
                + isPanel   * vec2(0.24, 0.76);

  // Begane grond: pui in plaats van ramen.
  float ground = step(floorIndex, 0.5);
  rowRange = mix(rowRange, vec2(0.10, 0.88), ground);
  colRange = mix(colRange, vec2(0.06, 0.94), ground);

  float edgeY = min(fy - rowRange.x, rowRange.y - fy);
  float edgeX = min(fx - colRange.x, colRange.y - fx);
  float opening = step(0.0, min(edgeX, edgeY));
  float frameWidth = mix(0.045, 0.022, isCurtain);
  float pane = opening * step(frameWidth, edgeX) * step(frameWidth, edgeY);
  float frame = opening - pane;

  // Onder de dakrand geen ramen; dat leest als een gemetselde borstwering.
  float parapet = step(vSize.y + vInfo.z - 0.85, height);
  float side = (1.0 - parapet) * (1.0 - roof);
  pane *= side;
  frame *= side;

  // Vensterbank: een lichte richel onder elk raam.
  float sill = side * (1.0 - ground)
    * step(rowRange.x - 0.05, fy) * (1.0 - step(rowRange.x, fy))
    * step(colRange.x - 0.04, fx) * (1.0 - step(colRange.y + 0.04, fx));

  // Overdag brandt er weinig licht; een gevel vol verlichte ruiten leest als
  // een spreadsheet in plaats van als een gebouw. 's Avonds gaat het grootste
  // deel aan — maar nooit alles, want dan verdwijnt de structuur weer.
  float litChance = mix(0.90, 0.34, uNight);
  float lit = step(litChance, hash21(vec2(columnIndex + vInfo.x * 91.0, floorIndex)));
  // Hoger in het gebouw vangt de ruit meer lucht en wordt hij lichter.
  float skyward = clamp(height / 42.0, 0.0, 1.0);
  vec3 glassColor = mix(vec3(0.075, 0.095, 0.125), vec3(0.14, 0.19, 0.25), skyward);
  glassColor = mix(glassColor, mix(vec3(0.30, 0.25, 0.16), vec3(0.55, 0.42, 0.24), uNight), lit);

  vec3 frameColor = mix(vec3(0.86, 0.85, 0.82), vec3(0.16, 0.17, 0.19), isCurtain);

  vec3 surface = wall;
  surface = mix(surface, frameColor * (0.7 + weather * 0.4), frame);
  surface = mix(surface, glassColor, pane);
  surface = mix(surface, mix(base, vec3(0.78), 0.55), sill);

  // ---- dak ----------------------------------------------------------------
  float roofGrey = dot(diffuseColor.rgb, vec3(0.30, 0.59, 0.11));
  vec3 roofColor = mix(vec3(roofGrey), diffuseColor.rgb, 0.22) * (0.40 + grain * 0.20);
  vec2 rel = abs(vec2(vLocalPos.x / max(vSize.x, 0.001), vLocalPos.z / max(vSize.z, 0.001))) * 2.0;
  float coping = step(0.88, max(rel.x, rel.y)) * roof;
  roofColor = mix(roofColor, vec3(0.42, 0.41, 0.39), coping * 0.8);

  // Op afstand naar het gemiddelde toe, anders flikkert het patroon.
  vec3 average = mix(wall, glassColor, 0.32);
  surface = mix(average, surface, detail);
  float paneAmount = pane * detail;

  diffuseColor.rgb = mix(surface, roofColor, roof);

  // De pui op de begane grond straalt minder dan een woonkamer erboven;
  // anders verblindt elke winkelruit je zodra het donker wordt.
  float glowStrength = (0.22 + uNight * 0.95) * mix(1.0, 0.55, ground);
  totalEmissiveRadiance += vec3(1.0, 0.80, 0.50) * paneAmount * lit * glowStrength;
  roughnessFactor = mix(mix(mix(0.86, 0.94, isBrick), 0.22, paneAmount), 0.93, roof);
  metalnessFactor = mix(mix(0.0, mix(0.52, 0.68, isCurtain), paneAmount), 0.0, roof);

  // Een vlakke gevel weerspiegelt de lucht overal precies hetzelfde, waardoor
  // alle ruiten dezelfde kleur krijgen. Een minieme knik per raam breekt dat.
  vec3 wobble = vec3(
    hash21(vec2(columnIndex, floorIndex)) - 0.5,
    hash21(vec2(floorIndex + 3.0, columnIndex)) - 0.5,
    hash21(vec2(columnIndex + 7.0, floorIndex)) - 0.5
  );
  normal = normalize(normal + wobble * 0.075 * paneAmount);
}
`,
    );
  };

  return material;
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------

export function createWaterMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#10394f'),
    roughness: 0.08,
    metalness: 0.25,
  });

  const uTime = { value: 0 };
  material.userData.uTime = uTime;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: sharedNoise() };
    shader.uniforms.uTime = uTime;
    injectWorldVaryings(shader);
    fragmentHeader(shader, 'uniform float uTime;');
    injectSurface(
      shader,
      /* glsl */ `
{
  vec2 a = vWorldPos.xz * 0.045 + vec2(uTime * 0.010, uTime * 0.006);
  vec2 b = vWorldPos.xz * 0.021 - vec2(uTime * 0.007, uTime * 0.011);
  float ripple = texture2D(uNoise, a).r * 0.6 + texture2D(uNoise, b).r * 0.4;
  diffuseColor.rgb *= 0.78 + ripple * 0.5;
  // Golven veranderen vooral hoe scherp de lucht weerspiegelt.
  roughnessFactor = 0.04 + ripple * 0.13;
}
`,
    );
  };

  return material;
}

// ---------------------------------------------------------------------------
// Eenvoudige materialen voor straatmeubilair
// ---------------------------------------------------------------------------

export function createPaintedMaterial(color: string, roughness = 0.5, metalness = 0.1) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness,
    metalness,
  });
}

/** Autolak: glanzend genoeg om de lucht te vangen, met kleur per instance. */
export function createCarPaintMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.22,
    metalness: 0.55,
  });
}

/**
 * Zachte donkere vlek onder een gebouw.
 *
 * Waar een muur de grond raakt komt bijna geen licht; zonder die aanzet lijkt
 * elk pand op de stoep geplakt. Een echte omgevingsocclusie is op een telefoon
 * te duur, maar deze vlek doet visueel bijna hetzelfde werk voor de prijs van
 * één transparant vlak per gebouw.
 */
export function createContactShadowMaterial(): THREE.MeshBasicMaterial {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Afstand tot de rand van het vierkant, niet tot het midden: zo volgt de
      // vlek de vorm van het gebouw in plaats van rond te zijn.
      const u = Math.abs((x + 0.5) / size - 0.5) * 2;
      const v = Math.abs((y + 0.5) / size - 0.5) * 2;
      const edge = Math.max(u, v);
      const alpha = Math.max(0, 1 - Math.max(0, (edge - 0.55) / 0.45)) ** 2.2;
      data[(y * size + x) * 4 + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;

  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity: 0.38,
    color: new THREE.Color('#05070b'),
  });
}

export function createGlassMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color('#101820'),
    roughness: 0.06,
    metalness: 0.65,
  });
}
