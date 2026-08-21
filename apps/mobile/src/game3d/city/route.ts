import { groundHeightAt, type Route } from '@game/shared';
import * as THREE from 'three';

/**
 * De route als een lint over het wegdek.
 *
 * Een pijl in de HUD zegt "die kant op" en houdt geen rekening met gebouwen; je
 * loopt er net zo vrolijk mee tegen een gevel aan. Een lijn die vóór je over
 * straat ligt zegt wélke straat, en dat is het verschil tussen een richting en
 * een route.
 *
 * Waarom een lint van driehoeken en geen `THREE.Line`: lijnbreedte werkt op de
 * meeste mobiele GL-implementaties niet — je krijgt altijd één pixel, en dat is
 * op een telefoon niet te zien. Een strook is gewone geometrie en gedraagt zich
 * overal hetzelfde.
 */

/** Breedte van het lint in meters. Net smaller dan een rijstrook. */
const BREEDTE = 0.9;
/** Boven de grond, zodat hij niet met het wegdek knippert. */
const ZWEEF = 0.05;
/**
 * Om de hoeveel meter een punt op een recht stuk.
 *
 * De route zelf heeft alleen hoeken, maar de grond niet: het rijdek ligt lager
 * dan de stoep. Zonder tussenpunten zou het lint over een stoeprand heen zweven
 * in plaats van eroverheen te lopen.
 */
const STAP = 2;

export interface RouteLint {
  mesh: THREE.Mesh;
  /** Laat het streeppatroon schuiven, zodat te zien is welke kant op. */
  update: (elapsed: number) => void;
  dispose: () => void;
}

function verdicht(route: Route): { x: number; z: number }[] {
  const uit: { x: number; z: number }[] = [];
  for (let i = 1; i < route.punten.length; i++) {
    const a = route.punten[i - 1]!;
    const b = route.punten[i]!;
    const lengte = Math.hypot(b.x - a.x, b.z - a.z);
    const stappen = Math.max(1, Math.ceil(lengte / STAP));
    for (let s = 0; s < stappen; s++) {
      const t = s / stappen;
      uit.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  const laatste = route.punten[route.punten.length - 1];
  if (laatste) uit.push({ x: laatste.x, z: laatste.z });
  return uit;
}

function maakMateriaal(bereikbaar: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTijd: { value: 0 },
      // Onbereikbaar wordt rood: dan is het geen route maar een richting, en
      // dat hoor je te zien voordat je een half uur de verkeerde kant op loopt.
      uKleur: { value: new THREE.Color(bereikbaar ? '#4ee0a8' : '#e0704e') },
    },
    vertexShader: /* glsl */ `
      attribute float aLangs;
      varying float vLangs;
      varying vec2 vUv;
      void main() {
        vLangs = aLangs;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTijd;
      uniform vec3 uKleur;
      varying float vLangs;
      varying vec2 vUv;
      void main() {
        // Strepen die naar de bestemming toe schuiven.
        float streep = fract(vLangs * 0.25 - uTijd * 0.8);
        float aan = smoothstep(0.55, 0.45, streep);
        // Naar de randen toe uitvagen, anders is het een plakband.
        float rand = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
        float alpha = (0.30 + aan * 0.55) * rand;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uKleur, alpha);
      }
    `,
  });
}

/** Bouwt het lint. Eén mesh voor de hele route. */
export function buildRoute(route: Route): RouteLint | null {
  const punten = verdicht(route);
  if (punten.length < 2) return null;

  const posities: number[] = [];
  const uvs: number[] = [];
  const langs: number[] = [];
  const index: number[] = [];
  let afgelegd = 0;

  for (let i = 0; i < punten.length; i++) {
    const hier = punten[i]!;
    const vorige = punten[Math.max(0, i - 1)]!;
    const volgende = punten[Math.min(punten.length - 1, i + 1)]!;
    if (i > 0) afgelegd += Math.hypot(hier.x - vorige.x, hier.z - vorige.z);

    // De dwarsrichting: haaks op waar de lijn hier heen loopt.
    let dx = volgende.x - vorige.x;
    let dz = volgende.z - vorige.z;
    const lengte = Math.hypot(dx, dz) || 1;
    dx /= lengte;
    dz /= lengte;
    const zij = { x: -dz * (BREEDTE / 2), z: dx * (BREEDTE / 2) };
    const y = groundHeightAt(hier.x, hier.z) + ZWEEF;

    posities.push(hier.x - zij.x, y, hier.z - zij.z);
    posities.push(hier.x + zij.x, y, hier.z + zij.z);
    uvs.push(0, 0, 1, 0);
    langs.push(afgelegd, afgelegd);

    if (i > 0) {
      const b = (i - 1) * 2;
      index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(posities, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aLangs', new THREE.Float32BufferAttribute(langs, 1));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();

  const material = maakMateriaal(route.bereikbaar);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  // Ná de grond en vóór de spelers: hij hoort op straat te liggen, niet erdoor.
  mesh.renderOrder = 2;

  return {
    mesh,
    update(elapsed) {
      material.uniforms.uTijd!.value = elapsed;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
