# Ontwerpreview: wordt dit een leuk spel?

Kritische doorlichting van `docs/GAME_DESIGN.md` (1.047 regels) met één vraag:
wordt dit een leuke, speelbare game — niet: is het document compleet.

Alles hieronder is tegen de code gecontroleerd, niet alleen tegen het document.
Op drie plekken bleek het document niet meer te kloppen met wat er gebouwd is;
die staan er expliciet bij.

**Kernoordeel vooraf.** Dit is een uitstekend *techniekdocument* en een zwak
*ontwerpdocument*. Het beschrijft systemen tot op de komma — grootboek,
schaduwstraal, A\*-heuristiek — en beschrijft de wérkwoorden van de speler in
één zin. Er is precies één kernactiviteit, en die is geautomatiseerd. De hele
rest van het document is machinerie die de opbrengst van die ene activiteit
verwerkt.

---

## 1. Core loop

### Wat een speler de eerste vijf minuten doet

Gemeten uit de code, niet uit het document:

| Stap | Bron |
|---|---|
| Je verschijnt op cel 64,64 in de Oude Stad | `city/layout.ts:73` |
| Er liggen 90 items in dat district, één per ~36 m | `spawner.ts:22`, `districts.ts` |
| Je loopt 6 m/s, dus ongeveer **6 seconden per item** | `ECONOMY.baseMoveSpeed` |
| Oprapen gebeurt **vanzelf** binnen 2,2 m | `SpawnField.tsx:44` |
| Gemiddelde waarde per item in de Oude Stad: **48** | berekend uit `rarityWeights` × `baseValue` |
| Een Studio kost 2.500 → **52 items**, ruim vijf minuten lopen | `properties.ts:29` |
| Er is **geen tutorial** — geen enkel bestand in `apps/mobile` noemt er een | gezocht op tutorial/onboarding/introductie |

### Het probleem

**De kernactiviteit heeft geen enkele beslissing.** In `SpawnField.tsx:44`
staat het letterlijk:

```ts
// Automatisch oprapen zodra je er langs loopt: op een telefoon is dat
// prettiger dan overal op moeten tikken.
if (closest && closest.distance <= pickupRadius && ...) void collect(closest.spawn);
```

Als UX-keuze is dat verdedigbaar. Als *gameplay* betekent het dat de enige
invoer in de dragende activiteit van het spel de **richting van de joystick**
is. Geen timing, geen keuze, geen risico, geen vaardigheid. Je stuurt een
poppetje langs lichtjes.

Vergelijk het met wat er wél in het document staat aan mechaniek: de buidel in
Het Verlaten Park (§6c) — wat je oppakt is pas van jou als je de landtong over
bent. Dat is een echte beslissing (doorgaan of banken?) met een echt risico. Die
zit in **1 van de 11 districten**.

### Waarom je over 30 minuten terugkomt

Het eerlijke antwoord uit het document: **omdat je kluis vol zit.** §4 zegt het
zelf — "Die heeft een maximum: zit hij vol, dan verlies je opbrengst. Dat is de
motor achter base-upgrades." Een timer die afloopt is een melding, geen reden.
En §4 *De manager* is een upgrade waarvan de hele functie is dat je die reden
kwijtraakt.

### Is er één kernactiviteit, of losse features?

Er is één kernactiviteit — lopen naar lichtjes — en zeven schermen die de
opbrengst ervan verwerken: `base`, `shop`, `craft`, `pass`, `profile`,
`rebirth`, `interior`. Geen van die zeven is zelf een activiteit; het zijn
uitgaveschermen. Dat is niet per se fout (idle games werken zo), maar het maakt
de kwaliteit van die ene activiteit alles-bepalend, en die is nu nul.

### Voorstel

Geef het oprapen een beslissing. Drie opties, in volgorde van hoe goedkoop ze
zijn omdat het meeste er al ligt:

**a. Maak de rugzak echt schaars.** Dit is bijna af en het document weet het
niet. Nagerekend: `ECONOMY.baseInventorySlots = 20`, en `inventoryCount` telt
**stuks, geen stapels** (`player.ts:175`). Bij één item per 6 seconden zit je
rugzak dus in **twee minuten** vol. Verkopen is sinds ronde 2 aan een
pandjeshuis gebonden, en de verste hoek is volgens het document 773 m — ruim
twee minuten lopen, heen én terug.

De echte lus is nu dus al: **2 minuten verzamelen, 4 minuten transport.** Dat is
tegelijk de oplossing (er ís een keuze: wat neem ik mee?) en een probleem (twee
derde van je tijd is lopen zonder iets te doen). Zie punt 4.

**b. Trek de buidelmechaniek uit het park de stad in**, in lichtere vorm. Wat je
oppakt is "onbevestigd" tot je het bij een pandjeshuis of thuis afgeeft; ga je
offline met een volle rugzak, dan verlies je een deel. Dat maakt van elke tocht
een beslissing en het gebruikt `ParkLoot` + de bankmechaniek die er al staan.

**c. Maak het oprapen zelf een handeling** voor alles boven `rare`: ingedrukt
houden, één seconde, onderbreekbaar. Gewone rommel blijft automatisch. Dan is
zeldzaamheid ook fysiek voelbaar in plaats van alleen een getal.

**Aanbeveling: a + b.** Samen maken ze van de wandeling een reeks beslissingen
zonder één nieuw systeem.

---

## 2. Fun factor per onderdeel

Eerst een correctie op de vraag: **drie van de vijf genoemde onderdelen bestaan
niet.** Gezocht in `docs/` en in alle broncode:

| Genoemd | Komt voor in het document | In code |
|---|---|---|
| Diefstal | **0 keer** | 0 keer |
| Minigames | **0 keer** | 0 keer |
| Jobs | 2 keer, samen één zin (§12 fase 4 punt 3) | 0 keer |
| Shops | ja, uitgewerkt | ja |
| RP | één alinea (§12 fase 4) | 0 keer |

Dat is op zichzelf de bevinding: het spel dat je in gedachten hebt bevat
activiteiten die nergens in het ontwerp staan.

### Wat er wél is, beoordeeld

| Activiteit | Op zichzelf leuk? | Oordeel |
|---|---|---|
| **Oprapen** | Nee | Geautomatiseerd (`SpawnField.tsx:44`). De dragende activiteit is de zwakste. |
| **Verkopen** | Nee | Een lijst met knoppen. Maar de *reis* ernaartoe is sinds ronde 2 wel echt — dat is het beste eraan. |
| **Inrichten** | Potentieel ja | Het enige onderdeel met expressie. Nu een raster met vaste vakken; er is geen manier om iets mooi te doen, alleen vol. |
| **Craften** | Nee | 8 recepten, `checkRecipe` + knop. Een wachttijd met een naam. Pure resource-sink. |
| **Season-opdrachten** | Nee | Zie hieronder. |
| **PvP in het park** | Potentieel ja | De enige echte spanning in het hele ontwerp. |
| **Rijden** | Matig | Het is transport. Leuk voor tien minuten, daarna functie. |
| **Rebirth** | Ja, als beslissing | Erfenis als valuta in plaats van multiplier (§8) is de sterkste ontwerpkeuze in het document. |

### De season-opdrachten zijn tellers, geen opdrachten

Alle 15 opdrachten in `season.ts:169` staan op zes metrieken: `collect_items`,
`collect_rarity`, `sell_value`, `place_items`, `distance`, `buy_upgrades`,
`collect_income`. Voorbeelden: *"Raap 15 items op"*, *"Raap 40 items op"*,
*"Raap 250 items op"*, *"Leg 2 km af"*, *"Leg 25 km af"*.

**Geen enkele opdracht vraagt je iets anders te doen dan wat je toch al deed.**
Ze meten het gedrag, ze sturen het niet. Een opdracht die je nergens heen stuurt
en niets nieuws laat proberen is een voortgangsbalk met een naam erop.

**Voorstel:** minstens een derde van de opdrachten locatie- of gebeurtenis-
gebonden maken. Dat kan met wat er al is:
- *"Verkoop 10 items bij het Pandjeshuis Industrie"* — `shopSpots()` bestaat.
- *"Wees in de hot zone op het hele uur"* — `hotDistrict()` bestaat en is nu
  volstrekt onzichtbaar voor de speler.
- *"Kom met tien items uit het park terug"* — `ParkLoot` bestaat.
- *"Richt drie kamers in met alleen meubels van één zeldzaamheid"* — dwingt
  keuze bij het inrichten.

### Craften mist een plek

`checkRecipe` heeft geen locatie. Sinds ronde 4 kun je je woning in lopen; een
werkbank die daar staat maakt van craften een reden om naar huis te gaan, en
daarmee van je woning een plek in plaats van een menu.

---

## 3. AFK/idle-risico — de grootste tegenstelling in het document

Je zegt: **expliciet geen idle-heavy game.** Het document zegt op drie plekken
het tegenovergestelde, en dat is geen nuance maar de kern van het ontwerp.

**1. §1, de tweede zin van het hele document:** *"…koopt er woningen, auto's en
luxe mee die **passief inkomen** genereren — ook als de app dicht is."* De
kernlus eindigt letterlijk in "meer passief inkomen".

**2. §11, bevinding 3:** *"Passief inkomen was te zwak voor een idle game.
Woninginkomen, kluisgrootte en meubelinkomen zijn met factor 7 verhoogd."* De
enige balansingreep die er ooit gedaan is, ging **zeven keer de idle-kant op**.

**3. §4, De manager:** een upgrade waarvan de functie is dat je de app niet meer
hoeft te openen om je geld op te halen.

### Wat dat concreet doet, gemeten

Ik heb per woningtier het passieve uurinkomen afgezet tegen het maximale actieve
uurinkomen in het beste district dat op dat level open is (300 items per uur ×
de verwachte waarde per item uit `rarityWeights`):

| Woning | Level | Passief/uur | Best actief/uur | Aandeel actief |
|---|---|---|---|---|
| Kraakpand | 1 | 35 | 14.399 | 99,8 % |
| Studio | 3 | 154 | 14.399 | 98,9 % |
| Appartement | 6 | 595 | 39.261 | 98,5 % |
| Rijtjeshuis | 12 | 2.380 | 39.261 | 94,3 % |
| Loft | 18 | 7.350 | 39.261 | 84,2 % |
| Villa | 26 | 35.600 | 170.078 | 82,7 % |
| **Penthouse** | 34 | 168.000 | 170.078 | **50,3 %** |
| **Landhuis** | 44 | 756.000 | 170.078 | **18,4 %** |
| **Privé-eiland** | 60 | 3.920.000 | 170.078 | **4,2 %** |

En dat is nog **te gunstig**: dit telt alleen woninginkomen, dus zonder
meubilair, upgrades, flexbonus en boosts, die er allemaal bovenop komen. De
simulatie in `sim/` komt over 30 dagen op 14 % actief uit.

Het document stelt in §11 zelf de grens: *"zakt het onder een tiende van je
inkomen, dan is de stad versiering geworden."* Bij het Landhuis staat het op
18 % vóór meubilair; met meubilair erbij is die grens ruim gepasseerd. **Het
spel schakelt zichzelf uit, en het document weet het.**

Daar komt bij dat de offline-cap oploopt van 4 naar 24 uur (`properties.ts`).
Die curve beloont *minder spelen* naarmate je verder komt.

### Voorstel

**a. Maak passief inkomen een vermenigvuldiger op actief inkomen in plaats van
een tweede kraan.** Het document stelt dit in §11 al voor, maar alleen voor
meubilair: *"laat de woning het meubilair **vermenigvuldigen** in plaats van er
een vast bedrag bij op te tellen."* Trek dat door naar de hele economie: je
woning produceert niets uit zichzelf, maar verhoogt wat je verdient met wat je
mee naar huis brengt.

Dan klopt alles ineens: verzamelen blijft altijd lonen, een groter huis
versterkt wat je gevonden hebt, en de stad blijft de plek waar geld verdiend
wordt. Het is één wijziging in `computeStats()` en het staat al als `it.todo` in
`test/balance.test.ts`.

**b. Houd je toch passief inkomen, keer dan de offline-curve om.** Beginnen op
24 uur en aflopen naar 4: vroeg vergevingsgezind, laat een reden om te spelen.

**c. Zet de meetlat hoger.** "Boven een tiende" is de meetlat van een idle game.
Wil je geen idle game, dan hoort actief bij élke tier de **meerderheid** te
zijn.

**d. De manager heroverwegen.** In de huidige vorm is hij een abonnement op niet
spelen. Alternatief dat de upgrade behoudt: de manager int automatisch, maar
alleen tot de kluislimiet — dus hij voorkomt verlies, hij vervangt je niet.

---

## 4. Progressie en pacing

### Er is een curve, en hij is één rechte lijn

9 woningtiers × 10 voertuigtiers × 6 base-upgrades × 50 season-tiers × rebirth.
Op papier is dat veel. In de praktijk is het **één ladder waar iedereen in
dezelfde volgorde op klimt** — zie punt 5.

### De pacing-fout staat al gemeten in het document

§11 *"Wat er nog niet klopt"*:

| Streefwaarde | Gemeten | Doel |
|---|---|---|
| Eerste aankoop | 7 min | binnen 2 min |
| **Langste stilte** | **2 uur** | onder 20 min |
| Eerste rebirth | 5u41 | 6–10 u |

Twee uur zonder dat je iets kunt kopen is de dood van een sessie, het staat er
al zwart op wit, en er is sindsdien niets mee gedaan. Dit is de enige
pacing-meting die het project heeft, en de uitkomst is genegeerd.

### De transportverhouding

Uit punt 1: **twee minuten verzamelen, vier minuten lopen naar een winkel.** Dat
is met twee pandjeshuizen op een stad van 1.280 × 1.280 m. Transport is geen
gameplay tenzij er onderweg iets gebeurt, en onderweg gebeurt niets.

**Voorstel:** niet méér winkels (dan verdwijnt de reis, en die reis is juist het
enige wat er nu ís). Maar wél iets ónderweg: de hot zone zichtbaar maken, een
koerieropdracht die dezelfde kant op gaat, een tweede pandjeshuis dat betere
prijzen geeft voor één categorie zodat *waar* je verkoopt een keuze wordt.

### Waarom je na een paar uur alles gezien hebt

Elf districten, en ze verschillen in: `spawnWeight`, `spawnTtlSeconds`,
`rarityWeights`, `facade`, `palette`, `floors`, `density`. **Dat zijn allemaal
getallen en kleuren.** Mechanisch is een nieuw district exact dezelfde wandeling
met een hogere verwachtingswaarde per item. Na het derde district heb je alles
gezien wat het spel te bieden heeft; daarna worden de getallen groter.

De unlock-levels maken het erger: 40 (Vliegveld), 50 (De Heuvels), 60
(Privé-eiland). De eerste rebirth valt gemeten op **level 20 na 5u41**. Drie van
je elf districten liggen dus voorbij de horizon van vrijwel elke speler.

**Voorstel:** geef elk district één eigen **regel**, geen ander getal. Het park
heeft er al één (buidel + banken) en dat is de beste inhoud in het document.
Zes voorbeelden die op bestaande machinerie draaien:

| District | Regel |
|---|---|
| De Haven | Kratten die twee spelers tegelijk nodig hebben om te openen |
| De Strip | Spawnt alleen tussen 20:00 en 04:00 speeltijd (de dag/nachtcyclus staat er al) |
| Vliegveld | Bewaking: kom je te dicht bij een patrouille, dan raak je je rugzak kwijt |
| Industrieterrein | Items liggen in containers die je moet openen — het enige district waar oprapen een handeling is |
| De Heuvels | Alleen toegang met een sleutel die je in de Jachthaven vindt |
| Centrum | Alle items liggen op daken; je hebt de helikopter of een lift nodig |

Eén regel per district is meer inhoud dan zes nieuwe districten.

---

## 5. Risico op samenheid

Dit is het scherpste punt van allemaal, en het is aantoonbaar in plaats van een
vermoeden.

### Er is geen enkele vertakking in de opbouw

- **Woningen** (`properties.ts`): tier 0 t/m 8, elk strikt beter en strikt
  duurder dan de vorige op **elke** as — inkomen, kluis, offline-cap, flex. Er
  is geen enkele reden om ooit iets anders te kopen dan de volgende.
- **Voertuigen**: hetzelfde patroon.
- **Base-upgrades**: zes stuks, allemaal "+x%".
- **Erfenis-voordelen** (§8): zes stuks, allemaal "+x%", allemaal tegelijk te
  kopen.

**Het bewijs staat in je eigen simulatie.** `sim/simulate.ts` speelt door *"steeds
het ding met de beste verhouding tussen extra inkomen en prijs"* te kopen. Als
een simulatie optimaal kan spelen, is er precies één opbouw — en dan speelt
iedereen die opbouw.

### Personages verschillen alleen in huidskleur en pet

`character.ts`: huidskleur, kleding, pet, elk een index in een vast palet. Twee
spelers verschillen visueel en verder in **niets**.

### "Business" bestaat niet

Het woord komt in het hele document niet voor. Als spelers een eigen zaak zouden
moeten hebben die anders aanvoelt dan die van een ander, is dat nog geen enkele
regel ontwerp.

### Voorstel

**a. Maak de erfenis-voordelen exclusief.** Zes voordelen, je mag er hooguit
twee maximaal uitbouwen. Dat is een grens in `rebirth.ts` en verder niets — en
ineens zijn twee spelers verschillend, met een keuze die pijn doet.

**b. Geef woningen een ruil in plaats van een ladder.** Loft: veel ruimte, weinig
flex. Penthouse: hoog inkomen, kleine kluis. Villa: grote kluis, lage
offline-cap. Dan is "welk huis" een beslissing in plaats van een rij afvinken.

**c. Roleplay is het echte antwoord, en het is het minst uitgewerkte deel van het
document.** §12 fase 4 punt 3 is één zin: *"koerier (pakketten tussen
districten), monteur (voertuigonderdelen omzetten in reparaties), handelaar
(inkoop op de ene markt, verkoop op de andere)."* Dat is niet een fase-item, dat
is een tweede spel. Open vraag 3 stelt het zelf: *"Zijn jobs vrijblijvend, of
kies je één beroep dat je identiteit bepaalt?"* Die vraag is de belangrijkste
onbeantwoorde vraag in het hele document, want het antwoord bepaalt of spelers
van elkaar verschillen.

---

## 6. Haalbaarheid per fase

Het document gebruikt fase 0–6, geen M0/M1. Stand: 0, 1, 2, 2b, 2c, 2e, 3 en 4a
zijn af. Over: 2d (balans), 4b (sociaal), 5 (live-ops), 6 (winkel).

**De haalbaarheid van het gedane werk is bewezen** — acht fases door één persoon
met Claude Code. Het scope-probleem zit niet in het verleden maar in wat er nog
staat, en daar staan drie dingen die te groot zijn opgeschreven:

**a. Fase 4b is één regel voor vijf rondes.** *"Chat met moderatie, emotes,
profielen, vrienden, leaderboards."* Alleen al chat met filteren, blokkeren,
muten en rapporteren is een ronde op zich — het document zegt dat zelf in §6b
(*"Dat is een eigen ronde werk, geen tekstveld dat er even bij kan"*) en zet het
dan toch als één regel in de tabel.

**b. Fase 4 punt 3 (jobs) is een tweede spel.** Drie beroepen, elk met een eigen
voortgang en eigen gereedschap, in één zin. Reken op vijf tot tien rondes.

**c. Fase 5 en 6 staan op de verkeerde plek in de volgorde.** Live-ops,
RevenueCat, analytics, Sentry, privacybeleid en App Store zijn weken werk aan
infrastructuur en winkelbureaucratie voor een spel waarvan **nog niet vaststaat
dat het leuk is**. Monetisatie bouwen voor een lus die zichzelf nog niet bewezen
heeft is de klassieke volgordefout.

**Wat wél realistisch is voor een eerste speelbare versie:** het spel is al
voorbij "speelbaar". Wat ontbreekt is geen omvang maar een **oordeel**. Zet er
een fase tussen die alleen dat doet: hooguit drie rondes, geen nieuwe systemen,
alleen de vraag *is dit leuk* beantwoorden met de knoppen die er al zijn.

---

## 7. Wat ontbreekt

Concrete gaten die een speelbare versie nodig heeft en die nergens in het
document staan:

**a. Geen tutorial.** Geen enkel bestand in `apps/mobile` noemt onboarding. Voor
een spel waarvan de kernhandeling **onzichtbaar** is (automatisch oprapen) is
dat fataal: een nieuwe speler weet niet eens dat hij iets gedaan heeft.

**b. Geen geluid, en geen trilling.** Er zit geen enkele audiobibliotheek in
`apps/mobile/package.json`. `expo-haptics` staat er wél in als afhankelijkheid
maar wordt **nergens geïmporteerd**. Voor een spel waarvan de kernhandeling
"ergens langslopen" is, is feedback geen afwerking maar het enige dat de
handeling bestaat.

**c. Geen faalstand.** Buiten het park kun je nooit iets verliezen. Geen risico
betekent geen spanning, en daarmee doet geen enkele beslissing ertoe.

**d. Geen reden om andere spelers tegen te komen.** Fase 4a zet ze in de wereld;
er is geen enkele mechaniek waardoor twee spelers samen meer waard zijn dan twee
spelers apart. (De kratten in De Haven uit punt 4 zijn de goedkoopste.)

**e. Geen accounts.** Open vraag 2. Alleen gast-accounts: telefoon kwijt is spel
kwijt. Dat blokkeert elke echte test met echte spelers.

**f. Geen enkele haak buiten de kluis.** Geen pushberichten, geen dagelijkse
inlogbeloning, geen melding. De hot zone rouleert elk uur (`hotDistrict()`) en
de speler kan dat alleen zien als de app al open is — precies andersom dan
bedoeld.

**g. Geen doel binnen een sessie.** Er zijn dagopdrachten (24 uur) en een kluis
(uren). Er is niets dat zegt "doe dit in de komende tien minuten". Dat is wat
een sessie een vorm geeft.

**h. Het balanshoofdstuk is verouderd** — en dat telt zwaar, want het is de enige
plek waar iets gemeten wordt dat met plezier te maken heeft. §11 concludeert:
*"De Rugzak-upgrade is bijna waardeloos. Je kunt overal verkopen, dus je
inventaris loopt nooit echt vol."* **Dat klopt sinds ronde 2 niet meer**:
verkopen is aan een pandjeshuis gebonden, de rugzak is 20 stuks en zit in twee
minuten vol. De conclusie is omgedraaid en niemand heeft het opnieuw gemeten.

---

## Prioriteitenlijst

### Aanpassen vóórdat er iets gebouwd wordt

1. **Beslis de idle-vraag.** Dit is de tegenstelling tussen wat je wilt ("geen
   idle-heavy game") en wat §1 en §11 van het document beschrijven en wat de
   getallen doen. Zolang dit openstaat, is niets anders te balanceren, want elke
   knop hangt eraan. *Aanbeveling: passief als vermenigvuldiger op actief, zoals
   §11 zelf al voorstelt voor meubilair.*

2. **Geef de core loop een beslissing.** Automatisch oprapen zonder risico is
   geen spel. Rugzakschaarste + locatiegebonden verkopen is voor 80 % al
   gebouwd; het staat alleen verkeerd beschreven in het document.

3. **Schrijf het hoofdstuk dat ontbreekt: wat doet de speler met zijn vingers.**
   1.047 regels, en er staat geen enkel hoofdstuk over wérkwoorden. Dat is het
   hoofdstuk dat bepaalt of dit leuk wordt; alle andere hoofdstukken bepalen of
   het wérkt.

4. **Meet het balanshoofdstuk opnieuw.** Het staat op een aanname die niet meer
   waar is (punt 7h), en het is je enige meetinstrument.

### Kan later, maar vóór publicatie

5. Tutorial / eerste vijf minuten.
6. Geluid en trilling — `expo-haptics` ligt er al ongebruikt.
7. Eén eigen regel per district in plaats van alleen andere getallen.
8. Exclusieve erfenis-voordelen en een ruil in de woningladder (tegen samenheid).
9. Echte accounts (open vraag 2).
10. De 2-uur-stilte uit §11 wegwerken.

### Bewust later

11. **Fase 5 en 6** (live-ops, IAP, analytics, App Store). Geen monetisatie-
    infrastructuur bouwen voor een lus die zich nog niet bewezen heeft.
12. **Jobs en roleplay** (fase 4 punt 3). Verdient eerst een eigen
    ontwerphoofdstuk met een antwoord op open vraag 3; het is nu één zin voor
    wat een tweede spel is.
13. **Handel tussen spelers.** Het document heeft gelijk dat dit ver weg moet
    blijven.

---

## Eén zin

Er is een uitstekend gebouwde stad met een uitstekend gebouwde economie, en
daartussenin één activiteit die de speler niets laat beslissen — de vraag is
niet of dit af te bouwen is, maar of iemand het na de derde wijk nog opent.
