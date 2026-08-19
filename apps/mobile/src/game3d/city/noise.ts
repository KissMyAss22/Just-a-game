import { mulberry32 } from '@game/shared';
import * as THREE from 'three';

/**
 * Ruistexturen worden hier gemaakt in plaats van ingeladen.
 *
 * React Native heeft geen canvas om een textuur op te tekenen, en een PNG
 * meesturen kost bundelgrootte en laadtijd. Een paar duizend getallen
 * uitrekenen bij het opstarten is goedkoper en geeft een naadloos herhaalbaar
 * patroon, wat je met een geknipte foto niet zomaar hebt.
 */

function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Waardenruis op een rooster dat om de rand heen doorloopt, dus tegelbaar. */
function lattice(size: number, seed: number): Float32Array {
  const rand = mulberry32(seed);
  const values = new Float32Array(size * size);
  for (let i = 0; i < values.length; i++) values[i] = rand();
  return values;
}

function sample(values: Float32Array, size: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smootherstep(x - x0);
  const ty = smootherstep(y - y0);
  const i0 = ((x0 % size) + size) % size;
  const j0 = ((y0 % size) + size) % size;
  const i1 = (i0 + 1) % size;
  const j1 = (j0 + 1) % size;
  const a = values[j0 * size + i0]!;
  const b = values[j0 * size + i1]!;
  const c = values[j1 * size + i0]!;
  const d = values[j1 * size + i1]!;
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

/**
 * Vier lagen ruis over elkaar: grote vlekken voor variatie in het wegdek,
 * fijne korrel voor het asfalt zelf.
 */
export function createNoiseTexture(resolution = 128, seed = 1337): THREE.DataTexture {
  const data = new Uint8Array(resolution * resolution * 4);
  const octaves = [
    { grid: 4, weight: 0.5 },
    { grid: 8, weight: 0.25 },
    { grid: 16, weight: 0.15 },
    { grid: 32, weight: 0.1 },
  ];
  const grids = octaves.map((o, index) => lattice(o.grid, seed + index * 977));

  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      let value = 0;
      octaves.forEach((octave, index) => {
        const grid = grids[index]!;
        value +=
          sample(grid, octave.grid, (x / resolution) * octave.grid, (y / resolution) * octave.grid) *
          octave.weight;
      });
      const index = (y * resolution + x) * 4;
      const byte = Math.max(0, Math.min(255, Math.round(value * 255)));
      data[index] = byte;
      data[index + 1] = byte;
      data[index + 2] = byte;
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

let cached: THREE.DataTexture | null = null;

/** Eén ruistextuur voor de hele app; hij is per definitie overal hetzelfde. */
export function sharedNoise(): THREE.DataTexture {
  if (!cached) cached = createNoiseTexture();
  return cached;
}
