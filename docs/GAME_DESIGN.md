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
achtvoud, dus straten om de 64 meter. Tussen de wegen liggen percelen van
2 × 2 cellen (16 × 16 m) met één gebouw per perceel — ongeveer negen panden per
huizenblok.

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

### Renderen

Alleen de 3 × 3 chunks rond de speler staan in de scene (384 m). Gebouwen,
plantsoenen en water gaan elk als één `InstancedMesh` per chunk naar de GPU —
honderden objecten, een handvol draw calls. Mist verbergt de rand van het
geladen gebied. Geen realtime schaduwen; wel een schaduwvlek onder de speler.

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

## 6. Base, woningen en voertuigen

Woningen (Kraakpand → Privé-eiland) bepalen basisinkomen, plaatsingsplekken,
kluisgrootte en offline-cap. Voertuigen (te voet → Superjacht) bepalen
loopsnelheid, draagcapaciteit en toegang tot verre districten. Een auto kopen
is dus een echte progressiestap, geen skin.

Base-upgrades: Kluis (+25% opslag), Aggregaat (+1 uur offline), Boekhouder
(+6% inkomen), Rugzak (+4 plekken), Magneet (+0,6 m oppakafstand).

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

Een simulatie in `packages/shared` die een virtuele speler tegen de échte
formules laat spelen: hij raapt items op met een realistisch tempo, verkoopt,
plaatst wat inkomen oplevert, en koopt steeds de upgrade met de beste
verhouding tussen prijs en opbrengst. De uitvoer is een tijdlijn.

Dat kan omdat de economie uit pure functies bestaat (`computeStats`,
`accrueIncome`, `upgradeCost`, `checkRecipe`, `erfenisFor`). Er is geen server
en geen database voor nodig, en de simulatie kan daarna als test blijven
draaien — dan merken we het meteen als een balanswijziging de curve breekt.

### Wat we meten

| Vraag | Wat we uitlezen |
|---|---|
| Voelt het begin snel? | Tijd tot de eerste betaalbare upgrade |
| Loopt het door? | Langste periode zonder iets dat je kunt kopen |
| Klopt de woningladder? | Tijd tot elke property-tier |
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

### Wat we daarna aanpassen

In deze volgorde, want elke knop hierboven beïnvloedt de volgende:

1. `ECONOMY.costGrowth` (nu 1,15) — bepaalt hoe snel alles duurder wordt.
2. De `incomePerHour`-waarden van items en woningen.
3. `ECONOMY.flexDivisor` — hoe zwaar luxe meetelt.
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
| 2c | Balansronde met simulatie (hoofdstuk 11) en base-indeling op posities | 🚧 volgende |
| 3 | Rijdbare voertuigen, dag/nacht, geluid, LOD en performanceronde op een midrange toestel | ⬜ |
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
- **Base-indeling.** Items worden geplaatst als aantal, nog niet op een
  specifieke plek in een 3D-ruimte die je zelf inricht.
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
