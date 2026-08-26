/**
 * Eén beeld uit de renderproef knippen, en meten of het licht klopt.
 *
 * `.preview/stad.png` is één lange plaat met alle beelden onder elkaar. Om er
 * één te beoordelen moet je weten waar hij begint, en dat volgt uit de hoogtes
 * in `scene.ts`. Die hier uitrekenen in plaats van uittellen scheelt een fout
 * die je pas ziet als je naar het verkeerde beeld zit te kijken.
 *
 * De twee getallen die het afdrukt zijn de enige harde maat die er voor licht
 * is. Uitgeblazen wit betekent dat er vorm verdwenen is: een verlichte ruit
 * hoort te gloeien, niet te branden. Bijna zwart betekent dat er detail in het
 * donker is weggevallen. Allebei op nul is geen garantie dat het mooi is, maar
 * ze zijn allebei boven nul een garantie dat het dat niet is.
 *
 *   pnpm knip <uitvoerbestand> ["naam van het beeld"]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const uit = process.argv[2];
if (!uit) {
  console.error('Gebruik: pnpm knip <uitvoerbestand> ["naam van het beeld"]');
  process.exit(1);
}
const naam = process.argv[3] ?? 'proefstraat, blauw uur';

const bron = readFileSync('scripts/preview/scene.ts', 'utf8');
const blok = bron.slice(bron.indexOf('const views: View[] = ['));
const namen = [...blok.matchAll(/name: '([^']+)'/g)].map((m) => m[1]!);
const hoogtes = [...blok.matchAll(/height: (\d+)/g)].map((m) => Number(m[1]));

const index = namen.indexOf(naam);
if (index < 0) {
  console.error(`Beeld niet gevonden: ${naam}`);
  console.error(`Beschikbaar: ${namen.join(' | ')}`);
  process.exit(1);
}

const y0 = hoogtes.slice(0, index).reduce((som, h) => som + h, 0);
const hoogte = hoogtes[index]!;
const src = PNG.sync.read(readFileSync('.preview/stad.png'));
const doel = new PNG({ width: src.width, height: hoogte });

let uitgeblazen = 0;
let bijnaZwart = 0;
let totaal = 0;
for (let y = 0; y < hoogte; y++) {
  for (let x = 0; x < src.width; x++) {
    const si = (src.width * (y0 + y) + x) << 2;
    const di = (doel.width * y + x) << 2;
    const r = src.data[si]!;
    const g = src.data[si + 1]!;
    const b = src.data[si + 2]!;
    doel.data[di] = r;
    doel.data[di + 1] = g;
    doel.data[di + 2] = b;
    doel.data[di + 3] = 255;
    totaal++;
    if (r > 250 && g > 250 && b > 250) uitgeblazen++;
    if (r < 18 && g < 18 && b < 18) bijnaZwart++;
  }
}

writeFileSync(uit, PNG.sync.write(doel));
const pct = (n: number) => ((n / totaal) * 100).toFixed(1);
console.log(`${naam}  →  ${uit}`);
console.log(`  uitgeblazen wit ${pct(uitgeblazen)}%  |  bijna zwart ${pct(bijnaZwart)}%`);
