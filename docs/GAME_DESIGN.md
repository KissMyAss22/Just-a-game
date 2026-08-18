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

## 8. Anti-cheat

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

## 9. Fasering

| Fase | Inhoud | Status |
|---|---|---|
| 0 | Monorepo, server, database, 3D-scene op je telefoon | ✅ af |
| 1 | Speelbare kern: stad, lopen, items, base, offline inkomen, winkel, season pass | ✅ af |
| 2 | Boosts echt laten werken, managers/automatisatie, base-indeling met plaatsing op posities, craften, balanceerronde | 🚧 volgende |
| 3 | Rijdbare voertuigen, dag/nacht, geluid, LOD en performanceronde op een midrange toestel | ⬜ |
| 4 | Multiplayer (Colyseus): andere spelers zien, chat + moderatie, profielen, base-bezoek, leaderboards | ⬜ |
| 5 | Live-ops: seizoenen configureren zonder deploy, events, admin-tooling | ⬜ |
| 6 | Echte IAP (RevenueCat), analytics, Sentry, privacybeleid, App Store | ⬜ |

---

## 10. Wat bewust nog niet gebouwd is

- **Handel tussen spelers.** De grootste bron van economie-exploits. Pas als de
  rest stabiel is, en dan met logging en limieten.
- **Boosts.** De definities staan er (`BOOSTS`), de multiplier wordt al
  toegepast, maar er is nog geen tabel met looptijden. Fase 2.
- **Craften.** Materialen worden verzameld maar hebben nog geen bestemming
  behalve verkopen.
- **Base-indeling.** Items worden nu geplaatst als aantal, niet op een
  specifieke plek in een 3D-ruimte.
- **Colyseus.** Bewust nog niet toegevoegd: eerst moet het spel alleen leuk
  zijn.

---

## 11. Open vragen

1. Moet de stad een **dag/nachtcyclus** krijgen die ook de loot beïnvloedt?
   (Nu al voorbereid met een tijd-modifier in de spawnweging.)
2. Wordt "RP" letterlijk rollenspel (jobs, rollen, verhaallijnen) of vooral
   samen in dezelfde stad zijn? Dit bepaalt de omvang van fase 4.
3. Willen we **prestige** (opnieuw beginnen met een permanente multiplier)?
   Idle games hebben dat meestal nodig om na een paar weken interessant te
   blijven.
4. Vanaf welk moment stappen we over van gast-accounts naar echte logins?
   Apple eist Sign in with Apple zodra er een andere social login is.
