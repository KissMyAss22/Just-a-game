/**
 * De kaart uit de telefoon, in een browser getekend.
 *
 * De kaart bestaat uit gewone rechthoeken, dus hij is één op één na te bouwen
 * met divs — en dan zie je meteen of het water op de goede plek ligt, of de
 * wijken kloppen en of de winkels op straat staan. Een omgeklapte as of een
 * halve cel verschuiving zie je niet aan de code, wel aan het plaatje.
 */
import { DISTRICTS, PAWN_SHOPS, shopSpots, spawnPosition, CITY } from '@game/shared';
import {
  districtRects,
  mainRoadRects,
  waterRects,
} from '../../apps/mobile/src/ui/phone/mapShapes';

const SIZE = 620;
const scale = (cells: number): number => (cells / CITY.gridSize) * SIZE;
const toCell = (world: number): number => world / CITY.cellSize + CITY.gridSize / 2;

const map = document.getElementById('map') as HTMLDivElement;
map.style.width = `${SIZE}px`;
map.style.height = `${SIZE}px`;

function draw(rects: ReturnType<typeof districtRects>): void {
  for (const rect of rects) {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:${scale(rect.cx)}px;top:${scale(rect.cz)}px;width:${Math.max(1, scale(rect.w))}px;height:${Math.max(1, scale(rect.h))}px;background:${rect.color}`;
    map.appendChild(el);
  }
}

draw(districtRects());
draw(waterRects());
draw(mainRoadRects());

function dot(x: number, z: number, color: string, size: number, label = ''): void {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:${scale(toCell(x)) - size / 2}px;top:${scale(toCell(z)) - size / 2}px;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:1px solid rgba(0,0,0,.5)`;
  map.appendChild(el);
  if (!label) return;
  const text = document.createElement('div');
  text.textContent = label;
  text.style.cssText = `position:absolute;left:${scale(toCell(x)) + size}px;top:${scale(toCell(z)) - 7}px;color:#fff;font:11px monospace;text-shadow:0 1px 2px #000`;
  map.appendChild(text);
}

for (const district of DISTRICTS) {
  const [x0, z0, x1, z1] = district.bounds;
  const text = document.createElement('div');
  text.textContent = district.name;
  text.style.cssText = `position:absolute;left:${scale(x0) + 4}px;top:${scale(z0) + 4}px;color:rgba(255,255,255,.75);font:10px monospace`;
  map.appendChild(text);
}

for (const spot of shopSpots()) dot(spot.x, spot.z, '#ffd166', 12, spot.name.replace('Pandjeshuis ', ''));
const start = spawnPosition();
dot(start.x, start.z, '#4dd4ac', 12, 'start');

const overlay = document.getElementById('overlay');
if (overlay) {
  overlay.textContent = [
    `wijken ${districtRects().length} | watervlakken ${waterRects().length} | doorgaande wegen ${mainRoadRects().length}`,
    `winkels gevonden: ${shopSpots().length} van ${PAWN_SHOPS.length}`,
    shopSpots().map((s) => `${s.id} @ ${Math.round(s.x)},${Math.round(s.z)}`).join(' | '),
  ].join('\n');
}
document.title = shopSpots().length === PAWN_SHOPS.length ? 'ok' : 'FOUT';
