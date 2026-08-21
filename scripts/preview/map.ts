/**
 * De kaart zoals de telefoon hem laat zien: de plaat met markers erop.
 *
 * Dit beeld toetst de omrekening, niet de plaat. De plaat komt uit
 * `citymap.ts`; hier wordt hij op vensterformaat gelegd en worden bekende
 * punten erop gezet — het startpunt, de drie pandjeshuizen, de landtong. Staan
 * die op de goede plek, dan klopt de omrekening die de app ook gebruikt, en
 * dát was de klacht: wat je op de kaart ziet klopte niet met waar je loopt.
 */
import { CITY, PARK_CAUSEWAY, cellToWorld, shopSpots, spawnPosition } from '@game/shared';

const VENSTER = 620;

/** Exact dezelfde omrekening als `toMap` in de app. */
const toMap = (world: number): number =>
  ((world / CITY.cellSize + CITY.originCell) / CITY.gridSize) * VENSTER;

const map = document.getElementById('map') as HTMLDivElement;
map.style.cssText = `position:relative;width:${VENSTER}px;height:${VENSTER}px;background:#12293a`;

const plaat = document.createElement('img');
plaat.src = '../../apps/mobile/assets/stadskaart.png';
plaat.style.cssText = `position:absolute;left:0;top:0;width:${VENSTER}px;height:${VENSTER}px`;
map.appendChild(plaat);

function marker(x: number, z: number, kleur: string, naam: string, maat = 11): void {
  const el = document.createElement('div');
  el.style.cssText =
    `position:absolute;left:${toMap(x) - maat / 2}px;top:${toMap(z) - maat / 2}px;` +
    `width:${maat}px;height:${maat}px;border-radius:50%;background:${kleur};` +
    'border:1px solid rgba(0,0,0,.6)';
  map.appendChild(el);

  const tekst = document.createElement('div');
  tekst.textContent = naam;
  tekst.style.cssText =
    `position:absolute;left:${toMap(x) + 9}px;top:${toMap(z) - 8}px;` +
    'color:#e8eef7;font:11px/1.2 system-ui;text-shadow:0 1px 2px #000';
  map.appendChild(tekst);
}

const start = spawnPosition();
marker(start.x, start.z, '#4ee0a8', 'start', 13);
for (const winkel of shopSpots()) marker(winkel.x, winkel.z, '#f5c451', winkel.name);

const landtong = cellToWorld(PARK_CAUSEWAY.x0 + 1, PARK_CAUSEWAY.z0 + 1);
marker(landtong.x, landtong.z, '#7fd0ff', 'landtong');

const info = document.getElementById('info');
if (info) {
  info.textContent = [
    `venster ${VENSTER} | raster ${CITY.gridSize} cellen van ${CITY.cellSize} m`,
    `start ${Math.round(start.x)},${Math.round(start.z)} -> ` +
      `${Math.round(toMap(start.x))},${Math.round(toMap(start.z))} px`,
    shopSpots()
      .map((w) => `${w.id} ${Math.round(w.x)},${Math.round(w.z)}`)
      .join(' | '),
  ].join('\n');
}
