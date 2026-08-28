# Analyse: waarom de stad niet op de referentie lijkt

Geschreven na zeven achtereenvolgende bijstellingen zonder één keer te toetsen of
ik het juiste probleem te pakken had. Geen code aangepast; dit is eerst ter
review.

Referentie: `docs/referentie/stijl-blauw-uur.png` — een autoplein bij schemer uit
een spel in de trant van Sunday City.

---

## 1. Wat is het probleem precies

Niet "het ziet er niet goed uit". Concreet, naast elkaar gelegd:

**Wat er in de referentie in één beeld staat**, geteld: verhoogde vitrinepodia met
eigen verlichting, drie auto's als hoofdonderwerp, banieren met logo's, palmen op
de voorgrond, plantenbakken, een gemetselde boog, een terras met stoelen,
etalages met eigen belettering, een fontein/plantvak, straatverlichting,
bestrating met een patroon dat richting geeft. **Ruim tien verschillende soorten
objecten**, waarvan meerdere groot en op de voorgrond.

**Wat er in ons beeld staat**, gemeten met `streetPropsIn` binnen 150 meter van de
proefstraat:

```
lamp         350
car          104
bench         35
bin           33
hydrant       26
TOTAAL       548  objecten
             5    verschillende soorten
```

Vijfhonderdachtenveertig objecten, en **vijf soorten**. Alle vijf klein, alle vijf
tegen de stoeprand, alle vijf op een vaste afstand van elkaar.

Het verschil is dus niet dat onze oppervlakken slechter zijn. Het verschil is dat
de referentie een **ingerichte plek** is en de onze een **geëxtrudeerde regel**.

**Wat je concreet ziet:**

- De ruimte tussen de gevels is leeg. Er staat niets in het volume: geen
  plantenbakken, geen borden die uitsteken, geen luifels die schaduw werpen op de
  stoep, geen terrasje, geen fietsen, geen paaltjes.
- Er is geen onderwerp. Elke straat is even belangrijk, dus geen enkele straat is
  interessant.
- Het silhouet is vlak. Panden zijn dozen; alles wat detail geeft zit ín het
  vlak in plaats van ervoor.

---

## 2. Wat ik in deze sessie heb geprobeerd, en wat het opleverde

Eerlijk, inclusief wat mislukte.

| Wat | Uitkomst | Waarom het het probleem niet oploste |
|---|---|---|
| Blauw uur: kunstlicht losgekoppeld van duisternis | **Werkte.** Grote sprong | Verbeterde de belíchting, niet wat er belicht wordt |
| Etalages feller dan woonkamers | Eerste poging blies alles uit naar wit; getemperd | Idem — een oppervlakte-eigenschap |
| Camera drie keer verplaatst | Eerste stond op het plein (geen lantaarns), tweede tegen een muur | Kaderfouten van mij, geen inhoudelijke verbetering |
| Omgevingsocclusie in de gevelshader | **Werkte.** 27 % van de pixels donkerder, nul extra kosten | Geeft diepte áán een vlak, maar vult de ruimte ervoor niet |
| Schaduwstraal verkleind (8,8 → 5,4 cm/texel) | **Werkte.** Gratis | Scherpere schaduw van dezelfde lege straat |
| Voeg egaal donkerder maken | **Mislukt.** Lokaal contrast zakte van 8,71 naar 7,92 | Specie is lichter dan steen; verdonkeren maakte de muur juist platter |
| Schaduwlijn op de steen-voegovergang | **Werkte.** Contrast naar 9,10 | Betere baksteen op een gevel waar niets voor staat |
| Ruwheid per steen | **Werkte.** Licht schuift nu over een muur | Idem |

**Het patroon in deze tabel is het punt.** Zes van de acht werkten technisch, en
allemaal langs dezelfde as: hoe een oppervlak licht vangt. De referentie
onderscheidt zich op een andere as: wat er in de ruimte staat. Ik ben acht keer
harder gaan poetsen op een leeg plein.

---

## 3. Root cause

**De stad heeft geen ingerichte plekken, en een objectwoordenschat van vijf.**

Dat is geen tekortkoming van de shaders of de materialen. Het is een gevolg van
hoe de wereld ontstaat: alles wordt afgeleid uit `CITY.seed` met één regel per
soort, en er is nergens een manier om te zeggen "hier, op deze plek, staat dít".

Twee onderdelen, en ze versterken elkaar:

**a. Elke straat is dezelfde straat.** De plaatsing is een lus met een vaste stap
langs de wegassen. Er is geen begrip van een pleintje, een terras, een marktje,
een hoek waar iets bijzonders staat. Het gevolg: er is geen enkele plek waar je
naartoe kijkt.

**b. Vijf soorten objecten moeten een hele stad vullen.** Lantaarn, boom, bank,
prullenbak, brandkraan, auto. Dat is de complete inboedel. Hoe goed je die ook
belicht, met vijf woorden schrijf je geen verhaal.

**Waarom het symptoom optreedt zoals het optreedt:** doordat de detaillering in de
shader zit en niet in de geometrie, is elk oppervlak áf maar staat er niets vóór.
Een pand is twaalf driehoeken met een uitstekende gevelshader erop. Dat leest van
dichtbij goed — de gevelproef laat dat zien — maar zodra je een straat in kijkt is
er alleen nog een gang van vlakken, want er is niets tussen jou en die vlakken in.

---

## 4. Bewijs in de code

**De hele woordenschat van de stad** — `packages/shared/src/city/streets.ts:121`

```ts
export type PropKind =
  | 'lamp'
  | 'tree'
  | 'bench'
  | 'bin'
  | 'hydrant'
  | 'car'
  // Het park heeft zijn eigen inboedel; zie `city/park.ts`.
  | 'parkPath'
  | 'parkBench'
  | 'brokenLamp';
```

Negen soorten, waarvan drie alleen in het park. Zes voor de hele stad.

**De plaatsing is één lus met een vaste stap** — `packages/shared/src/city/streets.ts:155`

```ts
const first = Math.ceil(from / LAMP_SPACING) * LAMP_SPACING;
for (let along = first; along < to; along += LAMP_SPACING) {
  for (const side of [-1, 1] as const) {
```

Met `LAMP_SPACING = 24` op regel 70. Elke lantaarn staat vierentwintig meter van
de vorige, aan beide kanten, langs elke wegas in de hele stad. Bank, prullenbak en
brandkraan hangen aan diezelfde lus. Dat is de reden dat elke straat hetzelfde
ritme heeft.

**Er is geen manier om iets met de hand neer te zetten.** Gezocht op `placeProp`,
`addProp`, `SCENERY`, `DECOR`, `authored`, `handmatig` in `packages/shared/src/city/`:
nul treffers. Alles komt uit `streetPropsIn` (`streets.ts:234`), `parkPropsIn`
(`park.ts`) en `treesOnLot`. Alle drie zijn formules.

**De panden ook** — `packages/shared/src/city/layout.ts:475`

```ts
function berekenPandOpCel(cx: number, cz: number): BuildingLot | null {
```

Eén functie bepaalt élk pand in de stad uit zijn celcoördinaat. Er is geen enkel
pand dat iemand heeft gekozen.

**De renderkant kan meer aan dan er is** — `apps/mobile/src/game3d/city/props.ts:271`

```ts
const SETUP: Record<PropKind, KindSetup> = {
  lamp: { geometry: lampGeometry, capacity: 220, ... },
```

Elke soort is één instanced mesh met een eigen capaciteit. Een soort erbij kost
één draw call. We gebruiken er nu negen van de honderd die een telefoon aankan —
gemeten: 99 draw calls in de hele scène.

**En de bijzondere gebieden die er zijn, zijn leeg.** `SPECIAL_AREAS` in
`layout.ts` levert het Stadspark en het Marktplein op als rechthoeken zonder
straten of panden. Dat is een gat in de bebouwing, geen ingerichte plek. Op het
Marktplein staan vier kramen; verder niets — en dat is precies waarom mijn eerste
proefstraat daar geen enkele lantaarn liet zien.

---

## 5. Voorgestelde fix

**Niet:** meer shaderwerk, geen materiaalkaarten, geen betere schaduwen. Die as is
op; ik heb hem deze sessie acht keer bewandeld.

**Wel, in twee stappen:**

### Stap 1 — de woordenschat verbreden (van 6 naar ~14 soorten)

Nieuwe `PropKind`-waarden met hun geometrie en een regel in `SETUP`. Kandidaten,
gekozen op wat de referentie vult en wat een straat leesbaar maakt:

| Soort | Waar | Waarom |
|---|---|---|
| Plantenbak | tegen de gevel, bij puien | Vult de zone tussen stoep en muur |
| Paaltje (bollard) | op hoeken en bij oversteken | Ritme op de stoep |
| Uithangbord | haaks uit de gevel | Het enige dat het silhouet doorbreekt |
| Terrasje (tafel + stoelen) | voor panden met een luifel | Maakt een pand een zaak |
| Fietsenrek met fietsen | langs de gevel | Dichtheid op ooghoogte |
| Bushalte | om de paar blokken | Een herkenningspunt |
| Stoepbord (A-bord) | bij een winkelpui | Klein, en het staat schuin — breekt het raster |
| Afvalcontainer | in een zijstraat | Rommeligheid waar het hoort |

Dit is een uitbreiding van een systeem dat wérkt, niet een nieuw systeem. Kosten:
één draw call en één geometrie per soort, dus ongeveer **+8 draw calls** op de
huidige 99.

**Waarom dit de root cause raakt en niet het symptoom:** het probleem is dat de
ruimte tussen de gevels leeg is. Dit vult die ruimte. Geen enkele hoeveelheid
occlusie of ruwheid doet dat.

### Stap 2 — ingerichte plekken mogelijk maken

Een `SCENES`-lijst naast `SPECIAL_AREAS`: een handvol plekken met een eigen
inrichting, uitgedrukt als objecten op een positie ten opzichte van het middelpunt
van het gebied. Het Marktplein is de eerste, en het autoplein uit jouw referentie
kan de tweede zijn.

Dit is bewust ná stap 1: stap 1 heeft die objecten nodig om een scène mee in te
richten, en stap 1 alleen verbetert al de hele stad in plaats van twee plekken.

**Wat ik hier expliciet níét voorstel:** honderden panden meer geometrie geven.
Dat vermenigvuldigt met het aantal panden en de shader doet dat werk al goed —
zie de gevelproef.

---

## 6. Hoe ik verifieer dat het werkt

De maat is niet "het ziet er beter uit". Vier concrete controles:

**a. De telling die het probleem aantoonde, herhalen.**

```
pnpm -s exec tsx -e "…streetPropsIn(x-150, z-150, x+150, z+150)…"
```

Nu: 548 objecten, 5 soorten. Verwacht na stap 1: **12 tot 14 soorten**, en een
dichtheid die op ooghoogte zichtbaar is — niet 350 lantaarns en verder niets.

**b. De belasting mag niet ontsporen.**

```
pnpm preview        # leest de overlay: tekenopdrachten | driehoeken | programma's
```

Nu: 99 draw calls, 232.144 driehoeken, 23 shaderprogramma's. Verwacht: **rond de
107 draw calls** (één per nieuwe soort) en hooguit enkele procenten meer
driehoeken, want elk nieuw object is een handvol primitieven in een instanced
mesh. Springt dit naar 150 of naar een half miljoen driehoeken, dan klopt er iets
niet aan de capaciteiten in `SETUP`.

**c. De renderproef, dezelfde proefstraat als deze sessie.**

```
pnpm preview && pnpm knip .preview/straat.png "proefstraat, blauw uur"
```

Verwacht: objecten op verschillende afstanden, iets dat het silhouet doorbreekt,
en de blik die ergens naartoe getrokken wordt. Dat is kijkwerk en dat geef ik ook
als kijkwerk — geen getal dat doet alsof het een meting is.

**d. De bestaande bewaking mag niet omvallen.**

```
pnpm -r typecheck    # exitcode 0
pnpm test            # 212 gedeelde + 6 servertests
```

Met name de test die vaststelt dat er geen straatmeubilair in het park of op een
bijzonder gebied staat: nieuwe soorten moeten door datzelfde eindfilter.

**En op jouw toestel:** de meter uit de optimalisatieronde — piekframetijd onder de
33 ms, en de loot-meshteller stabiel. Nieuwe instanced meshes zijn precies het
soort ding dat de renderlijst stilletjes laat groeien.

---

## Wat ik hiervan wil horen

Of je het eens bent dat het probleem in de inrichting zit en niet in de
oppervlakken. Zo ja, begin ik met stap 1 en meet ik a tot en met d. Zo nee, dan
heb ik de verkeerde diagnose gesteld en hoor ik graag waar hij mis is — want dan
zou ik opnieuw acht keer de verkeerde as bewandelen.
