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

interface SkyKeyframe extends Omit<SkyPalette, 'sunDirection'> {
  hour: number;
  /** 0 = klaarlichte dag, 1 = midden in de nacht. */
  night: number;
}

/**
 * De stand van het licht op zeven momenten van de dag; daartussen wordt
 * vloeiend gemengd.
 *
 * De klok van het toestel bepaalt welk moment je ziet. Dat is gratis inhoud:
 * wie 's avonds speelt krijgt een andere stad dan wie 's ochtends speelt, en
 * bij een spel waar je toch al de hele dag af en toe binnenvalt past dat.
 * De nacht wordt bewust nooit helemaal zwart — straatverlichting, verlichte
 * ramen en een flinke scheut maanlicht houden de stad leesbaar.
 */
const KEYFRAMES: SkyKeyframe[] = [
  {
    hour: 0,
    zenith: '#05070f', horizon: '#0e1524', haze: '#141d2e', ground: '#0a0b0e', sun: '#cfd8ff',
    sunLight: '#9db0dc', sunIntensity: 0.62,
    skyLight: '#46587e', groundLight: '#1c1f27', skyIntensity: 0.85,
    night: 1,
  },
  {
    hour: 5.6,
    zenith: '#1d3b6b', horizon: '#c9805f', haze: '#d49a78', ground: '#1b1a1c', sun: '#ffb27a',
    sunLight: '#ffc79a', sunIntensity: 1.3,
    skyLight: '#6f88b5', groundLight: '#3a3128', skyIntensity: 0.5,
    night: 0.42,
  },
  {
    hour: 8.5,
    zenith: '#2b5fa0', horizon: '#b6cbdd', haze: '#d6d6cf', ground: '#2c2b29', sun: '#ffe0b0',
    sunLight: '#fff0dc', sunIntensity: 2.7,
    skyLight: '#a9c4e0', groundLight: '#4d463a', skyIntensity: 0.38,
    night: 0.04,
  },
  {
    hour: 13,
    zenith: '#2f63a6', horizon: '#a8c3d8', haze: '#d8cdba', ground: '#31302d', sun: '#ffd9a0',
    sunLight: '#fffaf0', sunIntensity: 3.3,
    skyLight: '#b9cfe4', groundLight: '#544c40', skyIntensity: 0.35,
    night: 0,
  },
  {
    hour: 18.5,
    zenith: '#2a5a9c', horizon: '#dfb187', haze: '#e6c39a', ground: '#2e2b26', sun: '#ffcf90',
    sunLight: '#ffd9a8', sunIntensity: 2.5,
    skyLight: '#a8bcd6', groundLight: '#57452f', skyIntensity: 0.38,
    night: 0.05,
  },
  {
    hour: 20.8,
    zenith: '#16294f', horizon: '#c2704f', haze: '#9b7264', ground: '#1a1917', sun: '#ff9b5e',
    sunLight: '#e0906a', sunIntensity: 0.95,
    skyLight: '#4a5f88', groundLight: '#2c2620', skyIntensity: 0.45,
    night: 0.55,
  },
  {
    hour: 24,
    zenith: '#05070f', horizon: '#0e1524', haze: '#141d2e', ground: '#0a0b0e', sun: '#cfd8ff',
    sunLight: '#9db0dc', sunIntensity: 0.62,
    skyLight: '#46587e', groundLight: '#1c1f27', skyIntensity: 0.85,
    night: 1,
  },
];

const mixColor = (a: string, b: string, t: number): string =>
  `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;

/**
 * Waar de zon staat op dit uur. Onder de horizon nemen we de maan over: die
 * staat aan de andere kant en geeft veel minder, koeler licht.
 */
export function sunDirectionAt(hour: number): THREE.Vector3 {
  const t = (hour - 6) / 14; // 0 bij zonsopkomst, 1 bij zonsondergang
  const elevation = Math.sin(Math.PI * t);
  const x = Math.cos(Math.PI * t) * 0.85;
  const z = 0.5;
  if (elevation > 0.06) return new THREE.Vector3(x, elevation, z).normalize();
  return new THREE.Vector3(-x * 0.7, 0.5, -z * 0.7).normalize();
}

export interface Lighting {
  palette: SkyPalette;
  /** 0 = dag, 1 = nacht. Stuurt verlichte ramen en lantaarns aan. */
  night: number;
}

/** Mengt de keyframes tot de stand van het licht op dit uur. */
export function lightingAt(hour: number): Lighting {
  const clock = ((hour % 24) + 24) % 24;
  let from = KEYFRAMES[0]!;
  let to = KEYFRAMES[KEYFRAMES.length - 1]!;
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (clock >= KEYFRAMES[i]!.hour && clock <= KEYFRAMES[i + 1]!.hour) {
      from = KEYFRAMES[i]!;
      to = KEYFRAMES[i + 1]!;
      break;
    }
  }
  const span = to.hour - from.hour;
  const t = span <= 0 ? 0 : (clock - from.hour) / span;
  const lerp = (a: number, b: number) => a + (b - a) * t;

  return {
    night: lerp(from.night, to.night),
    palette: {
      zenith: mixColor(from.zenith, to.zenith, t),
      horizon: mixColor(from.horizon, to.horizon, t),
      haze: mixColor(from.haze, to.haze, t),
      ground: mixColor(from.ground, to.ground, t),
      sun: mixColor(from.sun, to.sun, t),
      sunDirection: sunDirectionAt(clock),
      sunLight: mixColor(from.sunLight, to.sunLight, t),
      sunIntensity: lerp(from.sunIntensity, to.sunIntensity),
      skyLight: mixColor(from.skyLight, to.skyLight, t),
      groundLight: mixColor(from.groundLight, to.groundLight, t),
      skyIntensity: lerp(from.skyIntensity, to.skyIntensity),
    },
  };
}

/** Het uur van de dag volgens de klok van het toestel, als kommagetal. */
export function currentHour(now = new Date()): number {
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

/** Laat in de middag: het uur waarop een stad er het best uitziet. */
export const DAY_PALETTE: SkyPalette = lightingAt(16).palette;

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
uniform float uNight;
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

  // Sterren: alleen 's nachts, en niet vlak boven de horizon waar de stad
  // toch al te veel licht geeft.
  if (uNight > 0.01 && h > 0.02) {
    float speck = texture2D(uNoise, dir.xz * 1.9 + dir.y * 0.37).r;
    float stars = smoothstep(0.90, 0.995, speck) * uNight * smoothstep(0.02, 0.30, h);
    color += vec3(0.86, 0.90, 1.0) * stars * 1.1;
  }

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
  /** Zet de lucht op een ander moment van de dag. */
  setLighting: (lighting: Lighting) => void;
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
    uNight: { value: 0 },
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
    setLighting({ palette: next, night }) {
      uniforms.uZenith.value.set(next.zenith);
      uniforms.uHorizon.value.set(next.horizon);
      uniforms.uHaze.value.set(next.haze);
      uniforms.uGround.value.set(next.ground);
      uniforms.uSun.value.set(next.sun);
      uniforms.uSunDir.value.copy(next.sunDirection);
      uniforms.uNight.value = night;
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
