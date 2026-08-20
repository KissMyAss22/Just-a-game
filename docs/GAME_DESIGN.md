# Just a Game — ontwerpdocument

Dit is de bron van waarheid voor wat het spel is en waar we heen gaan. Alles
wat hier staat is een besluit, geen idee. Ideeën die nog niet gekozen zijn
staan onderaan bij *Open vragen*.

---

## 1. Het spel in drie zinnen

Je hebt een base in een fictieve stad. Items spawnen willekeurig door de stad;
je raapt ze op (actief inkomen), plaatst ze in je base of verkoopt ze, en koopt
er woningen, auto's en luxe mee die **passief inkomen** genereren — ook als de
app dicht is. Elk seizoen van 28 dagen is er een season pass met een gratis en
een premium spoor.

De kernlus is: **verzamelen → plaatsen/verkopen → upgraden → meer passief
inkomen → verder de stad in.**

---

## 2. Vaste ontwerpbesluiten

| Besluit | Keuze | Waarom |
|---|---|---|
| Platform | Expo (React Native), iOS + Android | Eén codebase, snel testen op je eigen toestel |
| Wereld | Fictieve 3D-stad, geen GPS | Overal speelbaar, volledige controle, geen locatie-permissies |
| Stad | **Data, geen 3D-model** | Server en client kennen dezelfde stad; uitbreiden = data toevoegen |
| Autoriteit | Server beslist alles over de economie | Anders is valsspelen triviaal en is het achteraf niet te repareren |
| Tijd | Altijd servertijd | De telefoonklok vooruitzetten mag nooit geld opleveren |
| Geld | Integer + grootboek | Elke munt is herleidbaar; float-drift bestaat niet |
| Betaalde content | Altijd deterministisch | Loot boxes met echt geld zijn in NL/BE juridisch risicovol |
| Taal | Nederlands | Jouw taal; i18n is een latere klus, geen blokkade |

---

## 3. De stad

128 × 128 cellen van 8 meter = **1.024 × 1.024 meter**. Wegen liggen op elk
achtvoud, dus straten om de 64 meter.

Een bouwblok is zeven cellen breed: drie percelen van 2 × 2 cellen (16 × 16 m)
en één smal perceel van één cel tegen de volgende straat aan. Dat smalle
perceel is er bewust — zonder die rij zou elke straat maar aan één kant een
gevelwand hebben, met aan de overkant een lege strook.

**Panden aan een straat staan in een rij.** Ze vullen hun perceel van buur tot
buur en staan op één rooilijn, zodat ze een aaneengesloten gevelwand vormen;
alleen de diepte en de hoogte verschillen per pand. Hoekpanden vullen het hele
hoekperceel. Achter op het blok is het juist open: daar staat maar zelden iets,
en dan laag — dat worden de binnenterreinen en tuinen. Losse dozen met gaten
ertussen zien er nu eenmaal uit als een maquette, niet als een stad.

Alles wordt afgeleid uit `CITY.seed` met een deterministische generator
(`mulberry32`), dus de stad ziet er op elk toestel en op de server exact
hetzelfde uit. Er wordt nergens `Math.random()` gebruikt voor werelddata.

### Districten

| District | Sfeer | Loot | Unlock |
|---|---|---|---|
| Oude Stad | startwijk, smalle straten | veel gewoon spul, snelle respawn | level 1 |
| Centrum | wolkenkrabbers, neon | cash-items | level 5 |
| De Haven | containers, kranen | materialen, onderdelen | level 10 |
| Industrieterrein | fabriekshallen | craft-materialen | level 15 |
| Buitenwijk | rijtjeshuizen | meubels en decor | level 18 |
| Jachthaven | boten, terrassen | luxe | level 25 |
| De Strip | clubs | cash + seizoensfiches | level 30 |
| Vliegveld | hangars | zeldzaam, hoog risico | level 40 |
| De Heuvels | villa's | legendarisch | level 50 |
| Privé-eiland | eindgame, alleen per boot | mythisch | level 60 |

Elk uur wordt één district **hot zone**: dubbel zoveel spawns. Dat geeft een
reden om de stad rond te blijven gaan.

### Hoe de stad eruitziet

Het uitgangspunt: **detail zit in de shader, niet in de geometrie.** Een gevel
met duizend ruiten als losse vlakjes legt een telefoon plat. Dezelfde gevel als
één blok waarop de fragmentshader het ramenpatroon uitrekent kost niets extra.
Daardoor kan de stad honderden panden groot zijn en toch vloeiend draaien.

Wat er per onderdeel gebeurt:

| Onderdeel | Aanpak |
|---|---|
| Wegdek | Eén vlak per chunk. De shader kent de formule van het stratenraster en tekent asfalt, middenstrepen en zebrapaden op de juiste plek. |
| Stoep | Een verhoogd plateau over het hele bouwblok; alleen het rijdek ligt lager. Daardoor stap je zichtbaar op en van de stoep af. Langs de straat tegels, daarachter een verhard achtererf met een eigen tint per perceel. |
| Gevels | Vier soorten: stuc, metselwerk, vliesgevel en betonpanelen — per district. De shader tekent verdiepingen, ramen met kozijn en vensterbank, een plint, en op de begane grond een pui. |
| Ramen | Meestal donker glas dat de lucht weerspiegelt; overdag brandt er maar in enkele licht. Elk raam krijgt een minieme knik in de normaal, anders weerspiegelt een vlakke gevel overal precies dezelfde kleur. |
| Daken | Bitumen in plaats van gevelkleur, met een dakrand en één tot drie dakopbouwen (liftschacht, installaties). |
| Straatmeubilair | Lantaarns, bomen, banken, prullenbakken, brandkranen en geparkeerde auto's. Per soort één instanced mesh voor het hele zichtveld. |
| Lucht | Een bol met een verloop, zon en meeschuivende wolken. Wordt als eerste getekend met de dieptetest uit, zodat de far-plane van de camera kort kan blijven. |
| Omgevingslicht | Dezelfde lucht wordt omgezet naar een omgevingstextuur. Zonder die textuur heeft glas niets om in te spiegelen en wordt elk raam zwart. |
| Schaduw | Eén zonlicht met een schaduwcamera die de speler volgt. Plus een donkere aanzet waar een gevel de stoep raakt — echte omgevingsocclusie is op een telefoon te duur, maar die vlek doet visueel bijna hetzelfde werk. |

Alleen de 3 × 3 chunks rond de speler staan in de scene (384 m); straatmeubilair
wordt binnen ongeveer 150 m getekend. Mist in de kleur van de horizon verbergt
de rand van het geladen gebied.

De scene wordt **buiten React** opgebouwd (`src/game3d/city/`). De stad
verandert alleen als je een chunk verder loopt; zou dit uit componenten
bestaan, dan zou React zestig keer per seconde een boom vergelijken die
vrijwel nooit verandert.

### Dag en nacht

De klok van het toestel bepaalt het licht. Zeven momenten liggen vast — nacht,
dageraad, ochtend, middag, gouden uur, schemer, nacht — en daartussen wordt
vloeiend gemengd: luchtkleur, zonstand, zonkleur, mist en omgevingslicht. Onder
de horizon neemt de maan het over: veel zwakker en koeler, maar wel gewoon met
schaduw.

Dat is gratis inhoud. Wie 's avonds speelt krijgt een andere stad dan wie
's ochtends speelt, en bij een spel waar je toch al de hele dag af en toe
binnenvalt past dat precies.

Wat er 's avonds verandert:

- **Ramen gaan aan.** Overdag brandt er in ongeveer één op de tien ruiten licht,
  's nachts in twee op de drie. Nooit in alle — dan verdwijnt de structuur van
  de gevel weer. De pui op de begane grond straalt zwakker dan een woonkamer
  erboven, anders verblindt elke winkelruit je.
- **De lantaarns branden**, met een lichtplas op de stoep. Onder een kwart nacht
  staan ze uit; dan is het licht toch niet te zien en scheelt het twee
  tekenopdrachten.
- **Sterren** boven de horizon, sterker naarmate het later wordt.

De nacht wordt bewust nooit helemaal zwart: er blijft flink wat maanlicht en
hemellicht staan, want een spel waarin je niets ziet is geen spel.

De omgevingstextuur wordt hooguit elk kwartier speeltijd opnieuw gemaakt. Die
stap is te duur om elke frame te doen, en een kwartier verschil in
weerspiegeling ziet niemand.

### Beeldkwaliteit in drie standen

Een telefoon van vier jaar oud en een nieuwe iPhone zitten een factor tien uit
elkaar. In plaats van te mikken op het midden staat er één knop in het
profielscherm — **Laag, Normaal, Hoog** — die schaduwen, antialiasing,
zichtafstand en de hoeveelheid straatmeubilair regelt. De stand wordt op het
toestel bewaard en niet op de server: het is een eigenschap van de telefoon,
niet van de speler.

### De renderproef

Shaders vallen niet om bij het typechecken; ze vallen om op het toestel, als
zwart scherm. `pnpm preview` draait daarom exact dezelfde materialen en
chunkopbouw in een headless Chromium, meldt compilatiefouten mét regelnummer en
zet het resultaat in `.preview/stad.png`. Zo is een visuele wijziging te
beoordelen zonder telefoon.

De proef rendert vier momenten onder elkaar — ochtend, middag, schemer en nacht
— zodat ook de dag- en nachtcyclus te beoordelen is zonder tot vanavond te
wachten. Hij bouwt de wereld op met dezelfde `createWorld` als de app; alleen
de klok komt ergens anders vandaan.

Dat betaalde zich twee keer terug. De eerste versie van het wegdek en de stoep
gebruikte een variabele `patch`, wat een gereserveerd woord is in GLSL: de
shader compileerde niet en de straat werd domweg niet getekend. En de eerste
versie van de dag-nachtcyclus liet alle vier de beelden op de echte kloktijd
zien in plaats van op het ingestelde uur — meteen zichtbaar, want alles was
nacht.

---

## 4. Economie

### Valuta

- **Cash** — alles wat je normaal koopt
- **Gems** — premium valuta, in-game te verdienen (later ook te koop)
- **Season-XP** — voortgang in de season pass

### Passief inkomen

```
inkomen/uur = (woning + geplaatste items)
              × (1 + flexbonus) × (1 + upgrades) × (1 + boosts)
```

Het inkomen loopt in je **kluis**. Die heeft een maximum: zit hij vol, dan
verlies je opbrengst. Dat is de motor achter base-upgrades. Offline telt mee
tot de **offline-cap** (start 4 uur, oploopbaar tot 24+).

Twee details in `accrueIncome()` die er echt toe doen:

1. Er wordt alleen in **hele eenheden** bijgeschreven, en de teller schuift
   precies zoveel op als er is uitbetaald. Wie elke minuut inlogt bij 5/uur
   krijgt na een uur gewoon 5 — geen afrondingsverlies.
2. Tijd boven de cap **verdwijnt echt**: de teller schuift alsnog door naar
   `nu - cap`, zodat je niet oneindig kunt bank-sparen.

Beide gedragingen staan vast in tests.

### Flex Score

Woning + voertuig + geplaatste luxe-items geven Flex. Flex geeft een globale
inkomstenmultiplier (`flex / 2000`, max +500%). Zo is opscheppen mechanisch
beloond in plaats van alleen cosmetisch, en krijgen luxe-items een reden om
te bestaan.

### Kostencurve

`kosten(n) = basis × 1,15ⁿ` — de klassieke incremental-curve. Inkomen groeit
lineair per level, kosten exponentieel: elke upgrade voelt, maar je bent nooit
klaar.

### Grootboek

Elke mutatie van cash of gems schrijft een rij in `Transaction` met bedrag,
reden en het saldo daarna. Dit is niet optioneel: het is de enige manier om
een duplicatie-bug te vinden of iemand te compenseren.

### De manager

Vanaf de manager-upgrade wordt je kluis automatisch geleegd, dus je verliest
nooit meer inkomen aan overloop — maar hij houdt commissie in: 30% op level 1,
aflopend tot 5% op level 6.

Dat houdt alle drie de knoppen zinvol. Vroeg upgrade je de kluis omdat je zelf
int. Halverwege neem je een manager zodat er niets meer verloren gaat. Daarna
koop je de commissie omlaag. Zonder die commissie zou de kluis-upgrade meteen
waardeloos worden.

Technisch: `computeStats()` geeft `autoCollect` en `managerFee` terug, en
`accrualCapacity()` levert `Infinity` zolang er een manager is. De inning
gebeurt in `settleVault()` en schrijft twee bedragen in het grootboek — bruto
en commissie — zodat te zien is wat de manager heeft gekost.

### Boosts

Tijdelijke vermenigvuldigers die je met gems koopt of uit de season pass
krijgt: Koffie (+25%, 2 u), Assistent (+50%, 4 u), Stadsdeal (+100% en 25% kans
op dubbele opbrengst, 8 u) en Gouden Uur (+200% en 50% kans, 1 u).

De `spawnBonus` van een boost is bewust geen hogere spawnrate in de stad — die
geldt voor iedereen en is dus geen persoonlijke beloning. In plaats daarvan is
het een kans op **dubbele opbrengst** bij het oprapen. De worp gebeurt op de
server; de client hoort alleen de uitkomst.

Koop je een boost die al loopt, dan wordt de looptijd verlengd in plaats van
overschreven.

### Craften

Materialen hadden alleen een verkoopwaarde; met recepten worden ze de
grondstof voor interieur dat elk uur geld oplevert. De acht recepten vormen een
ladder van level 2 (Werkbank) tot level 34 (Privékluis), waarbij latere
recepten eerdere producten als ingrediënt gebruiken.

Alles wat je maakt is `craftOnly`: het ligt nooit op straat, dus craften is de
enige route ernaartoe. Een test bewaakt dat die items nergens in een spawnpool
terechtkomen.

`checkRecipe()` staat in `@game/shared` en wordt door de server gebruikt om te
beslissen en door de app om de knop te tonen — één regel, twee gebruikers.

---

## 5. Items

Zes zeldzaamheden (gewoon → mythisch) met waardevermenigvuldigers
1 / 3 / 9 / 27 / 90 / 300, en zes categorieën: waardevol, materiaal, onderdeel,
interieur, cosmetisch, seizoen.

**Interieur-items zijn de kern van het spel**: ze zijn het enige dat je in je
base kunt plaatsen, en alleen geplaatste items leveren inkomen en flex op. Zo
is er altijd een keuze tussen nu verkopen of straks meer verdienen.

Marktprijzen schommelen per dag per categorie tussen 0,85× en 1,25× —
deterministisch berekend uit het dagnummer, dus client en server tonen
hetzelfde bedrag.

---

## 6. Je woning inrichten

Woningen (Kraakpand → Privé-eiland) bepalen basisinkomen, kluisgrootte en
offline-cap. Voertuigen (te voet → Superjacht) bepalen snelheid,
draagcapaciteit en toegang tot verre districten. Een auto kopen is dus een
echte progressiestap, geen skin.

**In een wegvoertuig stap je ook echt in.** Zie hoofdstuk 6a.

Base-upgrades: Kluis (+25% opslag), Aggregaat (+1 uur offline), Boekhouder
(+6% inkomen), Rugzak (+4 plekken), Magneet (+0,6 m oppakafstand), Manager
(int automatisch, tegen commissie).

### 6a. Rijden

Vanaf de scooter kun je instappen. Een knop rechtsonder wisselt tussen lopen
en rijden; tijdens het rijden is de joystick gas en stuur, staat er een
snelheidsmeter in beeld en zwenkt de camera achter je voertuig.

**De vermenigvuldiger van je voertuig telt alleen als je erin zit.** Te voet
loop je je basistempo. Dat is het hele punt: eerst gaf een auto je sneller
lópen, wat nergens op sloeg en ook niet te merken was. Nu is de sportwagen
kopen voelbaar, omdat je er daadwerkelijk in gaat rijden.

Boot, helikopter en jacht zijn nog niet bestuurbaar — daar is water- en
luchtbeweging voor nodig. Zolang dat er niet is houden ze hun bonus op je
looptempo, zodat ze niet ineens minder waard worden dan de auto eronder.

Het rijmodel staat in `packages/shared/src/driving.ts`, en dat is geen toeval:
de server toetst een gemelde positie op `moveSpeed`, en een auto haalt
makkelijk vier keer je looptempo. Zonder dat de server dat weet is "ik reed"
niet te onderscheiden van "ik sprong".

Het model is bewust arcade en geen simulatie: gas, rem, sturen. Wat het wél
doet is de dingen die je meteen voelt als ze ontbreken:

| | |
|---|---|
| Sturen heeft vaart nodig | Een auto draait niet om zijn as. Onder ongeveer 3,5 m/s stuur je niet. |
| Sneller = rustiger stuur | Bij topsnelheid stuurt hij een stuk minder scherp dan stapvoets, anders is hij op straat niet te houden. |
| Achteruit stuur je omgekeerd | Zoals in een echte auto. Achteruit haal je een derde van je topsnelheid. |
| Remmen gaat harder dan optrekken | Ruim twee keer. Zonder dat voelt een auto als een boot. |
| Tegen een muur rijden kost vaart | Anders schuur je met vol gas langs een gevel alsof er niets aan de hand is. |

**Je voertuig raak je niet kwijt.** Hij blijft staan waar je uitstapt, maar sta
je er verder dan acht meter vandaan als je op Instappen drukt, dan komt hij
naar je toe. Je auto zoeken in een stad van een vierkante kilometer is geen
leuke spelmechaniek, alleen een vervelende.

### De plattegrond is de capaciteit

Elke woning heeft een **vloerplan**: een raster van cellen van 1,2 meter met
een deur die altijd vrij blijft. Hoeveel er in past staat nergens als los
getal — het is simpelweg het aantal vrije cellen. Twee plekken die allebei de
capaciteit bepalen zouden vroeg of laat uit elkaar gaan lopen, en dat is precies
de bugsoort die dit project al een keer heeft gehad met het spelerlevel.

| Woning | Plattegrond | Plekken |
|---|---|---|
| Kraakpand | 2 × 2 | 3 |
| Studio | 3 × 2 | 5 |
| Appartement | 3 × 3 | 8 |
| Rijtjeshuis | 4 × 3 | 11 |
| Loft | 4 × 4 | 15 |
| Villa | 5 × 5 | 24 |
| Penthouse | 6 × 5 | 29 |
| Landhuis | 6 × 6 | 35 |
| Privé-eiland | 8 × 6 | 47 |

### Spullen nemen ruimte in

Elk voorwerp staat op een **echte plek**, met een eigen rij in de database —
twee lampen zijn twee rijen met elk hun eigen positie, geen rij met aantal 2.
Grote stukken beslaan meer cellen: een aquarium 2 × 1, een vleugel 2 × 2. Draaien
wisselt breedte en diepte om.

Daardoor past een vleugel niet in een kraakpand. Dat is geen bug maar het punt:
groot meubilair is een reden om een groter huis te willen. De speler krijgt
altijd een uitlegbare reden terug — "daar staat al iets", "daar zit de deur",
"dat past niet binnen de muren" — nooit een stille weigering.

### De inrichtingsbonus

Een volle kamer levert tot **+25% inkomen** op, oplopend met hoeveel van de
vloer bezet is. Zo is inrichten niet alleen versiering, en is een groter huis
kopen niet automatisch beter: je bonus zákt als je verhuist naar een kamer die
je nog niet gevuld hebt. Dat maakt van verhuizen een investering in plaats van
een gratis upgrade.

### Bediening

Slepen in 3D is onnauwkeurig op een telefoon, dus het gaat in twee stappen:
tik een vak aan om de cursor te verzetten, zie meteen of het past (groen of
rood), en bevestig. De app rekent met exact dezelfde `checkPlacement()` als de
server, dus de knop kan nooit iets toestaan wat de server daarna weigert.

Tikken wordt zelf uitgerekend — een straal door het scherm, gesneden met het
vlak y = 0 — in plaats van via het event-systeem van react-three-fiber. Dat is
voorspelbaarder en werkt overal gelijk.

---

## 7. Season pass

- Seizoen = **28 dagen**, 50 tiers, 1.000 season-XP per tier.
- Season-XP komt uit 3 dagelijkse en 5 wekelijkse opdrachten, deterministisch
  gekozen per speler en per periode.
- **Gratis spoor**: cash, gems op elke tiende tier, een arcadekast, een
  scooter, een schilderij op tier 50.
- **Premium spoor** (950 gems): elke tier iets, plus 1.000 gems in totaal — wie
  de pass uitspeelt verdient het volgende seizoen terug. Dat is opzettelijk en
  wordt door een test bewaakt.
- Alles server-authoritative: seizoendefinitie, XP, geclaimde tiers, resets.

---

## 8. Rebirth

Op een gegeven moment is elke upgrade gekocht en wordt de curve saai. Met een
**rebirth** geef je alles op — geld, level, woning, voertuigen, upgrades,
spullen — en krijg je **erfenis** terug: een blijvende valuta die je uitgeeft
aan permanente voordelen.

### Hoeveel je krijgt

```
erfenis(totaal) = floor(12 × √(levenslange opbrengst / 1.000.000))
je krijgt       = erfenis(totaal) − wat je al eerder hebt gekregen
```

`lifetimeEarned` wordt **nooit** gereset. Dat is de kern van het ontwerp: omdat
de formule een wortel is en je alleen het verschil krijgt, kost elke volgende
rebirth vanzelf meer dan de vorige. Er is geen aparte teller nodig die de prijs
opdrijft — 694.445 verdiend voor de eerste, 14,7 miljoen voor de tweede.

Drempels: level 20 én minstens 10 erfenis winst. Zonder die tweede eis zou je
je voortgang kunnen weggooien voor bijna niets.

### Erfenis is een valuta, geen multiplier

Dit is de belangrijkste keuze in het ontwerp. Een vlakke "+5% per rebirth" is
een knop; een valuta die je uitgeeft is een beslissing. Zes voordelen, elk met
een eigen kostencurve:

| Voordeel | Effect | Max |
|---|---|---|
| Imperium | +3% passief inkomen | 50 |
| Onderhandelaar | +2% verkoopopbrengst | 30 |
| Ervaring | +4% XP | 25 |
| Nachtploeg | +1 uur offline inkomen | 12 |
| Stadskennis | +2% loopsnelheid | 20 |
| Startkapitaal | +25.000 cash bij je volgende rebirth | 10 |

Ze stapelen mét flex, upgrades en boosts in plaats van die te vervangen — een
test bewaakt precies dat.

### Wat blijft

Gems, je erfenis en wat je ermee kocht, je personage, je season pass, en je
levenslange opbrengst. Gems zijn premium valuta en mogen nooit verdwijnen; dat
staat ook in een test.

### Detail dat er echt toe doet

Startkapitaal uit het Startkapitaal-voordeel telt **niet** mee als levenslange
opbrengst. Zou het dat wel doen, dan zou dat voordeel zichzelf voeden en elke
volgende rebirth goedkoper maken in plaats van duurder. Daarom heeft `grant()`
een `countsAsEarnings`-vlag.

Verder gaat de kluis vóór de reset naar je cash, zodat die opbrengst nog
meetelt voor je erfenis, en gaat het wegvagen van je cash via het grootboek —
zodat de som van alle transacties blijft kloppen met je saldo.

---

## 9. Je personage

Naam en uiterlijk staan in `packages/shared/src/character.ts`, niet in de UI —
want zodra andere spelers je in fase 4 zien lopen, moet de server dezelfde
definitie kennen.

- **Uiterlijk**: huidskleur, kleding en pet, elk een index in een vast palet.
  Wat er uit de database komt gaat altijd door `normalizeAppearance()`, zodat
  een kapotte of verouderde waarde nooit tot een crash leidt.
- **Naam**: 3 tot 18 tekens, letters/cijfers/spaties/`-`/`_`, geen dubbele
  spaties, en een korte lijst gereserveerde namen. Dit is bewust een
  vormcontrole — echte moderatie hoort bij chat in fase 4.
- De server valideert de naam opnieuw; de app toont alleen dezelfde melding.

---

## 10. Anti-cheat

De client stuurt **intenties**, nooit uitkomsten.

- Oprapen wordt gecontroleerd op: bestaat de spawn nog, staat de speler er
  daadwerkelijk naast (`pickupRadius + 3 m`), en niet vaker dan eens per 350 ms.
- Positiemeldingen worden getoetst aan `snelheid × verstreken tijd`, waarbij de
  verstreken tijd wordt afgetopt op 30 seconden — anders bouwt een speler die
  de app lang dicht heeft een onbeperkt "teleportbudget" op.
- Gemelde posities worden altijd door `resolveMovement()` gehaald, zodat je
  nooit in een gebouw kunt staan.
- Alle afschrijvingen gebruiken een voorwaardelijke update, zodat twee
  gelijktijdige aankopen niet allebei kunnen slagen bij te weinig saldo.
- Spawns worden geclaimd met `updateMany ... where collectedAt is null`, dus
  twee spelers kunnen nooit hetzelfde item krijgen.

---

## 11. De balansronde

De hele economie is nu met de hand afgesteld: getallen die redelijk aanvoelen,
vastgezet met tests. Wat er níét is, is bewijs dat het ritme klopt over uren
spelen. Dat blijft de grootste onbekende van het project, en met rebirth erbij
is het belangrijker geworden — hoe lang een ronde hoort te duren voordat
opnieuw beginnen aantrekkelijk wordt, is nu puur een gok.

Dit hoofdstuk legt vast hóé we die balans gaan vinden, zodat "later" een plan
is en geen wens.

### Hoe we meten

`packages/shared/sim/` bevat een virtuele speler die tegen de échte formules
speelt: hij raapt items op, verkoopt, richt zijn woning in, koopt steeds het
ding met de beste verhouding tussen extra inkomen en prijs, en doet een rebirth
zodra het mag.

```bash
pnpm balance                 # standaardspeler, 30 dagen
pnpm balance --minutes 20    # iemand die minder speelt
pnpm balance --no-rebirth    # om de invloed van rebirth te isoleren
```

Dat kan omdat de economie uit pure functies bestaat (`computeStats`,
`accrueIncome`, `upgradeCost`, `erfenisFor`). Geen server, geen database.

**De aannames staan bovenaan `sim/simulate.ts` en zijn geen detail.** De
gesimuleerde speler is efficiënter dan een mens, de marktprijs staat vast op
1,0 om ruis te vermijden, en hij speelt altijd in het beste district dat mag.
De simulatie zegt dus niet "zo voelt het spel", maar "zo gedraagt de wiskunde
zich". Voor het gevoel moet je spelen.

### Wat we meten

| Vraag | Wat we uitlezen |
|---|---|
| Voelt het begin snel? | Tijd tot de eerste betaalbare upgrade |
| Loopt het door? | Langste periode zonder iets dat je kunt kopen |
| Klopt de woningladder? | Tijd tot elke property-tier |
| Loont verhuizen? | Hoe lang je bonus lager is na een grotere woning |
| Wanneer komt rebirth? | Tijd tot level 20 en tot de eerste rebirth |
| Loopt het uit de hand? | Verhouding inkomen/kosten per uur — groeit die weg of zakt hij in |
| Is offline de moeite? | Wat 8 uur offline oplevert, uitgedrukt in minuten actief spelen |
| Blijft actief spelen zinvol? | Aandeel actief versus passief inkomen door de tijd |

### Wanneer is het goed

Streefwaarden om tegen af te zetten — geen wetten, wel een meetlat:

- Eerste upgrade binnen **2 minuten**.
- Eerste eigen woning (Studio) binnen **een kwartier**.
- Nooit langer dan **20 minuten** zonder iets dat je kunt kopen.
- Level 20 en de eerste rebirth na **6 tot 10 uur** speeltijd, verspreid over
  ongeveer een week.
- 8 uur offline is ongeveer **30 tot 60 minuten** actief spelen waard: genoeg
  om terug te komen, te weinig om alleen offline te spelen.
- Actief verzamelen blijft ook laat in het spel merkbaar — zakt het onder een
  tiende van je inkomen, dan is de stad versiering geworden.

### Eerste ronde: wat de simulatie vond

De simulatie draaide voor het eerst en vond binnen één run twee fouten die
maandenlang onopgemerkt waren gebleven, terwijl alle 108 tests groen stonden.

**1. Zeldzaamheid werd dubbel verrekend.** `baseValue` in de itemtabel loopt al
op per tier (12 → 34 → 90 → 320 → 1.400), en `sellValue()` vermenigvuldigde dat
nóg eens met een zeldzaamheidsfactor (1/3/9/27/90). Eén ruwe diamant bracht
daardoor 126.000 op terwijl een rijtjeshuis 55.000 kost: één gelukkige vondst
sloeg uren spelen over. De prijs komt nu rechtstreeks uit `baseValue`; de
factor heet nu `RARITY_XP_WEIGHT` en geldt alleen nog voor ervaring.

**2. Legendarisch was niet zeldzaam.** In De Heuvels was 20% van alle drops
legendarisch of mythisch, op het privé-eiland 42%. Nu loopt dat van 0,2% in de
Oude Stad tot 8% op het eiland.

**3. Passief inkomen was te zwak voor een idle game.** Acht uur offline was drie
minuten spelen waard; 72% van alle inkomsten kwam uit oprapen. Woninginkomen,
kluisgrootte en meubelinkomen zijn met factor 7 verhoogd. Nu: 24 minuten en
14% actief. Dat is een gemeten startpunt, geen eindoordeel — de echte toets is
spelen.

### Wat er nog niet klopt

| Streefwaarde | Nu | Wil |
|---|---|---|
| Eerste aankoop | 7m spelen | binnen 2m |
| Eerste eigen woning | 12m spelen | ✅ binnen 15m |
| Langste stilte | 2u spelen | onder 20m |
| Eerste rebirth | 5u41m | 6-10u |
| 8 uur offline waard | 24m spelen | 30-60m |
| Aandeel actief inkomen | 14% | ✅ boven 10% |

Twee bevindingen die meer dan een getal vragen:

**De Rugzak-upgrade is bijna waardeloos.** Je kunt overal verkopen, dus je
inventaris loopt nooit echt vol. De simulatie koopt hem daarom nooit. Wil je
dat de rugzak ertoe doet, dan moet verkopen aan een plek gebonden worden — een
echte tocht terug naar je base. Dat is een ontwerpkeuze, geen afstelling.

**Meubilair verdwijnt in het niet bij grote woningen.** Een vol kraakpand met
doorsnee-meubels levert 57x het inkomen van het kraakpand zelf op; op het
privé-eiland is datzelfde meubilair nog 1% waard. Woninginkomen groeit ~5x per
tier, meubilair houdt dat niet bij. Gevolg: waar je het hele spel voor
verzamelt, doet er aan het eind niet meer toe.

De voorgestelde oplossing is structureel: laat de woning het meubilair
**vermenigvuldigen** in plaats van er een vast bedrag bij op te tellen. Dan
blijft verzamelen altijd lonen en versterkt een groter huis wat je hebt
gevonden. Dat verandert de kern van `computeStats()` en verdient een aparte
beslissing; het staat als `it.todo` in `test/balance.test.ts` zodat het niet
wegzakt.

### Wat we daarna aanpassen

In deze volgorde, want elke knop hierboven beïnvloedt de volgende:

1. `ECONOMY.costGrowth` (nu 1,15) — bepaalt hoe snel alles duurder wordt.
2. De `incomePerHour`-waarden van items en woningen.
3. `ECONOMY.flexDivisor` en `DECORATION_BONUS_CAP` — hoe zwaar luxe en een
   gevulde kamer meetellen.
4. De spawnrates per district — hoeveel actief spelen oplevert.
5. `REBIRTH.pointsFactor` en de kosten van de erfenis-voordelen.

---

## 12. Fasering

| Fase | Inhoud | Status |
|---|---|---|
| 0 | Monorepo, server, database, 3D-scene op je telefoon | ✅ af |
| 1 | Speelbare kern: stad, lopen, items, base, offline inkomen, winkel, season pass | ✅ af |
| 2 | Boosts, manager met commissie, craften, personage met naam en uiterlijk | ✅ af |
| 2b | Rebirth met erfenis en permanente voordelen | ✅ af |
| 2c | Base-indeling: spullen op echte plekken in je woning | ✅ af |
| 2d | Balansronde met simulatie (hoofdstuk 11) | 🚧 volgende |
| 2e | Visuele ronde: straten, gevels, licht, rijtjes, dag en nacht | ✅ af |
| 3 | Rijdbare wegvoertuigen | ✅ af · varen, vliegen, geluid en LOD nog niet |
| 4 | Roleplay en multiplayer (Colyseus) — zie hieronder | ⬜ |
| 5 | Live-ops: seizoenen configureren zonder deploy, events, admin-tooling | ⬜ |
| 6 | Echte IAP (RevenueCat), analytics, Sentry, privacybeleid, App Store | ⬜ |

### Fase 4 in detail: roleplay

Bevestigd: **RP staat voor roleplay**, in de geest van SundayCity. Dat maakt
fase 4 concreet, in deze volgorde:

1. **Samen in dezelfde stad.** Colyseus-room per stadsdeel, ~30 spelers per
   instantie, positie-sync op 10 Hz met interpolatie. Je ziet elkaars
   personage — naam, kleding, pet, voertuig — precies zoals het al gedefinieerd
   is in `character.ts`.
2. **Communiceren.** Emotes en tekstchat met proximity: alleen wie in de buurt
   staat leest mee. Filter, blokkeren, muten en rapporteren horen bij deze stap
   en niet erna — zonder die tools komt de app niet door de App Store-review.
3. **Rollen in de economie.** Jobs die je in de stad kunt aannemen en die
   spelers van elkaar afhankelijk maken: koerier (pakketten tussen districten),
   monteur (voertuigonderdelen omzetten in reparaties), handelaar (inkoop op de
   ene markt, verkoop op de andere). Elk beroep krijgt een eigen voortgang en
   ontsluit gereedschap.
4. **Sociale structuur.** Vriendenlijst, elkaars base bezoeken en waarderen,
   leaderboards op rijkdom en Flex Score, en later crews.

Bewust ná dit alles: handel in items tussen spelers. Dat is de grootste bron
van economie-exploits en vraagt eerst limieten, logging en een stabiele
economie.

---

## 13. Wat bewust nog niet gebouwd is

- **Handel tussen spelers.** De grootste bron van economie-exploits. Pas als de
  rest stabiel is, en dan met logging en limieten.
- **Balansronde.** De curve is met de hand gekozen en door tests bewaakt, maar
  nog niet doorgerekend over meerdere speeluren. Dit is de grootste onbekende
  van het project; hoofdstuk 11 beschrijft hoe we hem gaan wegnemen.
- **Colyseus.** Bewust nog niet toegevoegd: eerst moet het spel in je eentje
  leuk zijn.
- **Meertaligheid.** Alles is Nederlands. Voor de App Store wordt dat een
  aparte klus, geen blokkade.

---

## 14. Open vragen

1. Moet de stad een **dag/nachtcyclus** krijgen die ook de loot beïnvloedt?
   (Nu al voorbereid met een tijd-modifier in de spawnweging.)
2. Vanaf welk moment stappen we over van gast-accounts naar echte logins?
   Apple eist Sign in with Apple zodra er een andere social login is.
3. Hoe streng wordt roleplay? Zijn jobs vrijblijvend, of kies je één beroep dat
   je identiteit bepaalt? Dat laatste geeft meer karakter maar maakt de
   economie afhankelijker van hoeveel spelers er tegelijk online zijn.

*Beantwoord:* RP betekent roleplay — uitgewerkt in fase 4 hierboven.
*Beantwoord:* ja op prestige, onder de naam **rebirth** — uitgewerkt in
hoofdstuk 8.
