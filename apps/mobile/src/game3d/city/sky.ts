import * as THREE from 'three';
import { sharedNoise } from './noise';

/**
 * De lucht is een bol met een verloop, geen foto.
 *
 * Hij wordt als eerste getekend met de dieptetest uit, en volgt elke frame de
 * camera. Daardoor zit hij altijd "oneindig ver weg" zonder dat de far-plane
 * van de camera opgerekt hoeft te worden, wat de dieptebuffer onnauwkeurig
 * zou maken en op een telefoon meteen zichtbaar wordt als flikkerende randen.
 */

export interface SkyPalette {
  zenith: string;
  horizon: string;
  haze: string;
  ground: string;
  sun: string;
  /** Richting waar de zon staat, genormaliseerd. */
  sunDirection: THREE.Vector3;
  /** Kleur en sterkte van het directe zonlicht. */
  sunLight: string;
  sunIntensity: number;
  /** Vulling vanuit de hemel, zodat schaduwen niet dichtslaan. */
  skyLight: string;
  groundLight: string;
  skyIntensity: number;
}

/**
 * Laat in de middag: de zon staat laag genoeg voor lange schaduwen, maar hoog
 * genoeg om de straat nog te raken. Dat is het uur waarop een stad er het best
 * uitziet, en het geeft meteen diepte aan vlakke gevels.
 */
export const DAY_PALETTE: SkyPalette = {
  zenith: '#2f63a6',
  horizon: '#a8c3d8',
  haze: '#d8cdba',
  ground: '#31302d',
  sun: '#ffd9a0',
  sunDirection: new THREE.Vector3(0.55, 0.46, 0.70).normalize(),
  sunLight: '#fff0d8',
  sunIntensity: 3.1,
  skyLight: '#b9cfe4',
  groundLight: '#544c40',
  // Laag gehouden: de omgevingstextuur levert het meeste omgevingslicht al.
  // Stapelen we die twee, dan slaat de schaduw dicht van kleur in plaats van
  // donkerder te worden, en wordt alles blauw.
  skyIntensity: 0.35,
};

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHaze;
uniform vec3 uGround;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uTime;
uniform sampler2D uNoise;
varying vec3 vDir;

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;

  vec3 color = mix(uHorizon, uZenith, smoothstep(0.0, 0.62, h));
  // Een smalle band nevel vlak boven de horizon; zonder dat oogt een verloop
  // meteen als een verloop en niet als lucht.
  color = mix(color, uHaze, exp(-max(h, 0.0) * 16.0) * 0.45);
  color = mix(uGround, color, smoothstep(-0.10, 0.015, h));

  float sun = max(dot(dir, uSunDir), 0.0);
  color += uSun * pow(sun, 1200.0) * 6.0;
  color += uSun * pow(sun, 14.0) * 0.30;

  // Wolken: de ruistextuur op een denkbeeldig vlak boven de stad, wat
  // meeschuivend. Alleen boven de horizon, en zwakker naar de rand toe.
  if (h > 0.02) {
    vec2 plane = dir.xz / (h + 0.28);
    vec2 uv = plane * 0.11 + vec2(uTime * 0.0035, uTime * 0.0018);
    float n = texture2D(uNoise, uv).r;
    float m = texture2D(uNoise, uv * 2.3 + 0.37).r;
    float cloud = smoothstep(0.52, 0.80, n * 0.72 + m * 0.28);
    cloud *= smoothstep(0.02, 0.30, h);
    vec3 lit = mix(vec3(0.72, 0.75, 0.80), vec3(1.02, 0.98, 0.92), pow(max(sun, 0.0), 3.0));
    color = mix(color, lit, cloud * 0.75);
  }

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

export interface SkyDome {
  mesh: THREE.Mesh;
  /** Elke frame aanroepen: houdt de lucht om de camera heen en laat wolken lopen. */
  update: (camera: THREE.Camera, elapsed: number) => void;
  dispose: () => void;
}

export function createSkyDome(palette: SkyPalette = DAY_PALETTE): SkyDome {
  const uniforms = {
    uZenith: { value: new THREE.Color(palette.zenith) },
    uHorizon: { value: new THREE.Color(palette.horizon) },
    uHaze: { value: new THREE.Color(palette.haze) },
    uGround: { value: new THREE.Color(palette.ground) },
    uSun: { value: new THREE.Color(palette.sun) },
    uSunDir: { value: palette.sunDirection.clone() },
    uTime: { value: 0 },
    uNoise: { value: sharedNoise() },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 20), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;

  return {
    mesh,
    update(camera, elapsed) {
      mesh.position.copy(camera.position);
      uniforms.uTime.value = elapsed;
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * Zet dezelfde lucht om in een omgevingstextuur.
 *
 * Zonder omgeving heeft een fysisch materiaal niets om in te weerspiegelen:
 * glas wordt zwart en metaal wordt grijs. Met deze textuur vangen ruiten en
 * autolak de lucht op, en dát is wat het verschil maakt tussen "gekleurde
 * blokken" en "een stad".
 *
 * Geeft null terug als het toestel geen half-float rendertargets aankan; de
 * scene werkt dan gewoon door, alleen wat vlakker.
 */
export function createEnvironment(
  renderer: THREE.WebGLRenderer,
  palette: SkyPalette = DAY_PALETTE,
): THREE.Texture | null {
  let dome: SkyDome | null = null;
  let pmrem: THREE.PMREMGenerator | null = null;
  try {
    // De onderkant van de omgeving is bewust veel lichter dan de echte lucht.
    // Een ruit staat rechtop en weerspiegelt dus vooral wat er *onder* de
    // horizon zit: straat en overkant. Nemen we daar de donkere grondkleur
    // van de skybox voor, dan wordt elk raam een zwart gat.
    dome = createSkyDome({ ...palette, ground: '#8b8781' });
    const scene = new THREE.Scene();
    scene.add(dome.mesh);
    pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    return pmrem.fromScene(scene, 0.04, 1, 200).texture;
  } catch {
    return null;
  } finally {
    pmrem?.dispose();
    dome?.dispose();
  }
}
