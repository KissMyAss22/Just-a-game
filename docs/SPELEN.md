# Het spel draaien op je eigen computer

Je hebt drie dingen nodig, en één telefoon.

| Wat | Waarvoor | Waar |
|---|---|---|
| **Node 20 of hoger** | draait de server en de bundler | [nodejs.org](https://nodejs.org) |
| **pnpm** | haalt de dependencies op | `npm install -g pnpm` |
| **Docker Desktop** | draait de database | [docker.com](https://www.docker.com/products/docker-desktop) |
| **Expo Go** | de app op je telefoon | App Store / Play Store |

Node en Docker installeer je gewoon met de installer van hun website; klik
overal op volgende. Herstart daarna je computer, anders vindt Windows de
commando's nog niet.

---

## Windows: dubbelklikken

Op Windows hoef je geen commando's te typen. In de map staan deze bestanden:

| Bestand | Wanneer |
|---|---|
| **INSTALLEER.bat** | een keer, de allereerste keer |
| **START.bat** | elke keer dat je wilt spelen |
| **STOP.bat** | als je klaar bent |
| **CONTROLE.bat** | om te zien welke Expo-SDK er echt staat |
| **SCHOON-INSTALLEREN.bat** | als er iets blijft haperen dat je niet kunt plaatsen |

Zorg dat **Docker Desktop draait** voordat je begint — je ziet het walvis-icoon
rechtsonder bij je klok.

`INSTALLEER.bat` haalt alles op en richt de database in; dat duurt de eerste
keer een paar minuten. Daarna opent `START.bat` twee vensters: één met de
server en één met de QR-code. Die twee moeten open blijven staan zolang je
speelt.

Gaat er iets mis, dan blijft het venster open met een melding erin. Loopt het
vast op Docker, start dan Docker Desktop en probeer het opnieuw.

> Deze bestanden zijn geschreven en nagelopen, maar niet op een echte
> Windows-machine uitgevoerd — dat kan ik hier niet. Werkt er iets niet, laat
> de melding zien die in het venster blijft staan.

---

## Handmatig (macOS, Linux, of als je liever typt)

```bash
git clone https://github.com/KissMyAss22/Just-a-game.git
cd Just-a-game

pnpm setup          # controleert alles en vult je instellingen in
pnpm install        # eenmalig, duurt een paar minuten
pnpm db:up          # database starten (Docker moet draaien)
pnpm db:migrate     # tabellen aanmaken en de stad vullen met items
pnpm dev:server     # de server - laat dit venster open staan
```

En in een **tweede** terminalvenster:

```bash
pnpm dev:mobile     # toont een QR-code
```

Scan de QR-code met **Expo Go**. Op iPhone doe je dat met de camera-app, op
Android met de scanner in Expo Go zelf.

> **Je telefoon en je computer moeten op hetzelfde wifi-netwerk zitten.**
> Dat is verreweg de meest voorkomende oorzaak als het niet werkt.

`pnpm setup` zoekt zelf het IP-adres van je computer op en zet dat in
`apps/mobile/.env`. Verhuis je naar een ander netwerk, draai hem dan opnieuw.

---

## Werkt het niet?

### "Kan de server niet bereiken op http://…"

Dit staat in de app zelf. Test in deze volgorde:

**1. Draait de server?** In het venster van `pnpm dev:server` moet staan:
`Server listening at http://0.0.0.0:4000`, met daarboven een regel als
`Draait versie a1b2c3d, gestart om …`.

Let op die versieregel als er iets niet klopt. Staat er een oude hash, of een
starttijd van een uur geleden, dan kijk je naar een venster dat nog van vóór je
laatste pull is — en dan zoek je een fout die in de nieuwe code allang weg is.
Sluit in dat geval álle oude vensters; twee servers op dezelfde poort geeft
gegarandeerd verwarring, want maar één van de twee krijgt de poort.

**2. Kan je computer zichzelf bereiken?** Open in je browser:
`http://localhost:4000/health` — je hoort `{"ok":true,...}` te zien.

**3. Kan je telefoon je computer bereiken?** Dit is de beslissende test. Open op
je **telefoon** in de browser: `http://JOUW-IP:4000/health`, waarbij JOUW-IP het
adres is dat `pnpm setup` liet zien.

- Zie je `{"ok":true,...}`? Dan ligt het niet aan het netwerk.
- Krijg je niets? Dan komt je telefoon niet bij je computer. Meestal is dat:
  - **je firewall.** Windows vraagt bij de eerste start of Node door de firewall
    mag — kies ja, en let op dat je bij "openbaar netwerk" ook toestemming geeft
    als dat je wifi is. Op macOS: Systeeminstellingen → Netwerk → Firewall.
  - **een VPN op je computer.** Zet die tijdelijk uit; hij zet je in een ander
    netwerk dan je telefoon.
  - **gasten-wifi.** Veel routers laten apparaten op het gastnetwerk niet met
    elkaar praten. Zet beide op het gewone netwerk.

### "Er ging iets mis op de server."

Let op het verschil met de melding hierboven: die zegt dat je de server niet
*kunt bereiken*, deze dat hij wél antwoordt maar met een fout. Je netwerk is dus
in orde, en zoeken in je wifi-instellingen is zonde van je tijd.

De melding zelf zegt nu wát er misging. Twee oorzaken komen het vaakst voor, en
je herkent ze aan de tekst:

**"The table `public.…` does not exist in the current database."** — er is een
**tabel bijgekomen** die jouw database nog niet heeft. Zodra een ronde iets
nieuws opslaat, komt er een migratie mee in de code die je database nog moet
uitvoeren.

**"Unknown field `…` for include statement on model `…`"** — de database is
prima, maar de **gegenereerde Prisma-client** kent de wijziging nog niet. Die
wordt gemaakt door `prisma generate`, en dat gebeurde alleen bij `pnpm install`.
Sinds kort doet `pnpm dev:server` het ook bij elke start.

Allebei worden ze opgelost door hetzelfde commando:

```
pnpm db:up        # alleen als je Postgres nog niet draait
pnpm db:migrate
```

Sinds kort doet `pnpm dev:server` dit zelf bij het starten — eerst `generate`,
dan `migrate deploy` — dus normaal merk je er niets van. Kwam je van een oudere
versie, dan is dit de eerste keer die je met de hand moet doen.

**Twijfel je of alles het weer doet?** Draai `pnpm smoke` terwijl je server
draait. Dat loopt in één keer de weg af die de app ook aflegt — aanmelden,
toestand ophalen, iets oprapen in het park en de landtong oversteken — en zegt
bij de eerste stap die niet klopt waar het misgaat. Start je server met
`DEV_TOOLS=1`, dan wordt het parkdeel meegenomen; zonder slaat hij dat over en
zegt dat erbij.

Draait je Postgres niet, dan start de server nu ook niet meer — met een duidelijke
melding van Prisma in plaats van een app die pas bij het eerste verzoek stukgaat.
Dat is met opzet: een server zonder database werkt toch niet.

### "Docker is geinstalleerd maar draait niet"

Start Docker Desktop en wacht tot het icoon niet meer beweegt. Draai daarna
`pnpm setup` opnieuw.

### "Project is incompatible with this version of Expo Go"

Deze melding betekent bijna altijd: het project vraagt een nieuwere Expo-SDK
dan jouw Expo Go aankan. Expo Go in de App Store loopt altijd een tijdje achter
op de nieuwste SDK, dus "ik heb de laatste versie" lost het niet op.

Er zijn twee oorzaken, en de eerste is veruit de meest voorkomende.

**1. Je hebt gepulld, maar niet opnieuw geinstalleerd.**

Pullen verandert alleen *welke* versies het project wil. De pakketten die er
echt staan blijven ongewijzigd tot je opnieuw installeert. Draait het project
dus op SDK 54 terwijl er nog SDK 56 in `node_modules` staat, dan serveert Metro
gewoon SDK 56 en klaagt Expo Go.

START.bat controleert dit nu zelf voordat hij begint. Ziet hij een verschil,
dan ruimt hij de oude pakketten op en haalt ze opnieuw op. Je hoeft er niets
voor te doen behalve wachten. Wil je alleen kijken zonder te starten: dubbelklik
op **CONTROLE.bat**.

**2. Jouw Expo Go ondersteunt een oudere SDK dan het project.**

Open Expo Go op je telefoon en kijk bij de versie-informatie: daar staat
"supported SDK". Staat daar een lager nummer dan wat CONTROLE.bat toont, geef
dat nummer dan door — dan zet ik het project naar die SDK.

Daarom staat dit project bewust op **SDK 54** en niet op de allernieuwste.
Werk de Expo-pakketten dus niet zomaar bij: dan kun je het spel niet meer met
Expo Go openen en heb je een eigen development build nodig. Zie
`apps/mobile/package.json` - daar staat waarom.

### Samen spelen

Laat je vriend dezelfde QR-code scannen met Expo Go, op hetzelfde
wifi-netwerk. Hij krijgt een eigen account (dat hangt aan zijn toestel, niet
aan de code) en verschijnt in dezelfde stad. Boven in beeld staat 👥 met het
aantal spelers binnen 170 meter; staat daar een streepje, dan is de verbinding
met de server weg.

Chat is er nog niet — je ziet elkaar lopen en rijden, maar praten gaat
voorlopig nog gewoon naast de telefoon.

### Waar houdt de stad op?

De wereld is 1.280 bij 1.280 meter. De stad zelf beslaat daarvan de westelijke
1.024 meter; de strook erachter is zee, met Het Verlaten Park erin. Aan de
zuidkant en rond het privé-eiland ligt ook zee; daar kun je niet heen lopen, en
varen kan nog niet. Loop je vast tegen water, dan is dat de kust en niet een
fout.

Wil je zelf zien hoe groot hij is: open **Opties → Testgereedschap** en zet
onder *Bewegen* de vliegmodus aan. Je gaat dan dwars door alles heen en met de
pijlen rechts in beeld omhoog. In datzelfde scherm staat ook de loopsnelheid
(1×, 2×, 4× of 8×) en een teleport naar het startpunt, de pandjeshuizen, je
eigen voordeur, het park of een coördinaat dat je zelf intypt. Zet je de
kaartstand aan, dan brengt een tik op de kaart in je telefoon je erheen.

Daarvoor moet je server wel met `DEV_TOOLS=1` draaien — zie `apps/server/.env`;
zonder dat weigert hij de teleport en duwt de snelheidscontrole je terug.

### Hoe rijd ik?

Zodra je een scooter of auto hebt, staat er rechtsonder een knop **Instappen**.
De joystick is dan gas en stuur: naar voren is gas, naar achteren remmen en
achteruit, links en rechts is sturen. Sturen werkt pas als je rijdt — een auto
draait niet om zijn as.

Je voertuig blijft staan waar je uitstapt. Ben je te ver weggelopen, dan komt
hij naar je toe zodra je op Instappen drukt; je kunt hem dus niet kwijtraken.

Boot, helikopter en jacht zijn nog niet bestuurbaar. Die geven zolang een
bonus op je looptempo.

### Het spel hapert of voelt traag

Ga naar **Profiel** en zet **Beeldkwaliteit** op *Laag*. Dat zet schaduwen en
antialiasing uit en tekent minder straatmeubilair; het scheelt op een ouder
toestel een flinke slok. Draait alles juist vloeiend, probeer dan *Hoog* voor
scherpere schaduwen en meer detail.

### De QR-code doet helemaal niets

Controleer of je telefoon en je computer op hetzelfde wifi-netwerk zitten, en
doe de test met `http://JOUW-IP:4000/health` hierboven.

### Poort 4000 of 8081 is al in gebruik

Er draait nog een oude server. Sluit dat venster, of:

```bash
# macOS / Linux
lsof -ti:4000 | xargs kill
# Windows (PowerShell)
Get-NetTCPConnection -LocalPort 4000 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ }
```

### Ik wil helemaal opnieuw beginnen

```bash
pnpm db:down          # database stoppen
docker volume rm jag-pgdata jag-redisdata
pnpm db:up && pnpm db:migrate
```

Je speler, je geld en je huis zijn dan weg — de stad wordt opnieuw gevuld.

### Ik heb geen telefoon bij de hand

```bash
pnpm dev:mobile
```

Druk daarna in dat venster op `a` voor een Android-emulator of `i` voor de
iOS-simulator (die laatste alleen op een Mac met Xcode). De 3D-stad draait in
een emulator een stuk trager dan op een echte telefoon.

---

## Wat je kunt verwachten

Je begint in een kraakpand in de Oude Stad, zonder geld.

1. **Loop rond met de joystick** linksonder. Sleep rechts om de camera te
   draaien, knijp om in en uit te zoomen.
2. **Items rapen zichzelf op** als je erlangs loopt. Je ziet ze als gekleurde
   kristallen; de kleur zegt hoe zeldzaam ze zijn.
3. **Tabblad Base** → verkoop wat je niet nodig hebt, of zet meubels neer.
4. **Tabblad Base → Inrichten** → hier zet je spullen op een echte plek in je
   huis. Hoe voller de kamer, hoe hoger je inkomen.
5. **Tabblad Winkel** → upgrades, een grotere woning, een voertuig.
6. **Sluit de app en kom later terug** — je kluis is dan volgelopen.

Werkt iets niet zoals je verwacht, dan is dat nuttige informatie: de balans is
gemeten met een simulatie, maar nooit door een mens gespeeld.

## Waar verkoop ik mijn spullen?

Bij een **pandjeshuis**. Er staan er drie in de stad — herkenbaar aan de rode luifel en
het bord met drie koperen ballen:

- **Oude Stad**, een meter of veertig van waar je begint;
- **Industrieterrein**, aan de westkant;
- **Buitenwijk**, aan de oostkant.

Loop je erlangs, dan verschijnt links onderin een knop "Verkopen". Waar je ook staat in de
stad, er is er altijd eentje binnen een paar honderd meter.

In je rugzak zelf kun je spullen alleen **weggooien**. Dat klinkt onhandig maar is de
bedoeling: zo is de stad een plek waar je naartoe gaat in plaats van een decor waar je
doorheen loopt. Raakt je rugzak boven de tachtig procent, dan verschijnt vanzelf een pijl
naar de dichtstbijzijnde winkel.

## Het Verlaten Park

Ten oosten van de stad ligt een eiland: **Het Verlaten Park**. Geen straten,
geen stoepranden — gras, bomen, grindpaden die er nog liggen, verweerde banken
en hier en daar een omgevallen lantaarnpaal of een ruïne om achter te schuilen.

**Hoe je er komt.** Er is precies één toegang: een landtong ter hoogte van het
midden van de oostkust. De rest is zee, en zee is niet begaanbaar. Dat is geen
hek dat gehandhaafd moet worden maar gewoon de vorm van de kaart. Op de kaart in
je telefoon zie je hem liggen; navigeren werkt er net zo goed heen als naar een
pandjeshuis.

**Waarom je erheen zou gaan.** Vijf items bestaan alleen daar en nergens anders:
een bank met een naamplaatje, een overwoekerd standbeeld, een orchidee uit de
kas, een carrouselpaard en de parkpoort zelf. Het zijn allemaal pronkstukken die
je in je woning kunt neerzetten, dus ze leveren ook passief inkomen op. De kans
op zeldzaam spul ligt er hoger dan waar ook, maar niet zóveel hoger dat oprapen
belangrijker wordt dan je base — dat is bewust.

**Je buit is er nog niet veilig.** Alles wat je binnen het park oppakt komt in
een aparte buidel terecht en niet in je rugzak. Boven in beeld staat hoeveel er
in zit. Pas als je de landtong over loopt en weer in de stad staat, verhuist
alles in één keer naar je rugzak. Dat heet **banken**.

Op dit moment kun je die buit nog niet verliezen: er is nog niets wat je
neerhaalt. Zodra spelers elkaar in het park kunnen aanvallen verandert dat, en
dan valt precies dié buidel op de grond als je neergaat. Je base, je meubels,
je cash en je gewone rugzak blijven daar altijd buiten.

## De kaart en de weg ernaartoe

De kaart in je telefoon is een echte plattegrond van de stad: straten,
bouwblokken, de kustlijn, het havenbassin, het privé-eiland en het park met zijn
landtong. Knijpen zoomt in, slepen schuift op, en met **Op mij** en **Hele stad**
spring je terug.

**Navigeren gaat met een lijn, niet met een pijl.** Tik een pandjeshuis, een
speler of je eigen deur aan en kies hem als bestemming; op straat ligt dan een
groene lijn voor je die de weg wijst. Die volgt de straten en houdt rekening met
gebouwen — een pijl deed dat niet en wees net zo vrolijk dwars door een gevel.
Loop je een andere kant op, dan rekent hij zichzelf opnieuw uit.

Is er geen looproute — het privé-eiland ligt in zee en er is nog geen boot — dan
wordt de lijn rood en krijg je alsnog een pijl met de afstand hemelsbreed. Dat is
eerlijker dan een lijn het water op trekken.

## De telefoon

Onderin staat één knop: je telefoon. Daar zit alles in.

| App | Wat het doet |
|---|---|
| 🌆 Stad | Terug naar het spel |
| 🗺️ Kaart | De hele stad, met de winkels, andere spelers en wat er om je heen ligt |
| 👥 In de buurt | Wie er binnen 170 meter loopt, met afstand en voertuig |
| 🏠 Base · 🪚 Werkbank · 🛒 Winkel · 🎟️ Seizoen · ⚙️ Opties | De schermen die eerst tabbladen waren |

Op de kaart of in de lijst kun je een **pandjeshuis of een speler aantikken**: er verschijnt
dan een pijl in beeld die aangeeft welke kant je op moet en hoe ver het nog is. Nog een keer
tikken zet hem weer uit.

**Praten met elkaar kan nog niet.** Spraak vraagt om techniek die niet in Expo Go past — daar
is een eigen ontwikkelbuild voor nodig. Chat en spraak komen samen, want die vragen ook om
filteren, blokkeren en rapporteren, en dat hoort er in één keer bij.

## Je woning van binnen

Open **Base** in je telefoon en tik op **Naar binnen**. Je staat dan in je eigen deuropening
en loopt met de joystick de kamer in; vegen draait de camera om je heen.

Het vakje voor je neus licht op, en de knoppen onderin gaan altijd over dát vakje:

- **Voor een leeg vak:** open je rugzak onderin, kies iets, draai het en zet het neer.
- **Voor iets dat er al staat:** draaien of oppakken.
- **Iets in je handen én voor een meubel staan:** dan wordt het wisselen.

De kamers zijn met deze ronde flink groter geworden — een cel is van 1,2 naar 2 meter
gegaan. Je krot is nu 4 bij 4 meter, een appartement 6 bij 6, een villa 10 bij 10 en het
privé-landgoed 16 bij 12. Het **aantal plekken is niet veranderd**, dus je inkomen blijft
precies hetzelfde; het is dezelfde woning, alleen op ware grootte.

## Je huis staat in de stad

Elke woning is een echt pand met een adres. Je eigen voordeur herken je aan het lampje
erboven; loop ernaartoe en er verschijnt **Naar binnen**.

| Woning | Waar |
|---|---|
| Kraakpand | Achterstraat, Oude Stad |
| Studio | Havenflat, Oude Stad |
| Appartement | Parkflat, Centrum |
| Rijtjeshuis | Lindelaan, Buitenwijk |
| Loft | Pakhuiskade, Industrieterrein |
| Villa | Hoogzicht, De Heuvels |
| Penthouse | Toren aan het Plein, Centrum |
| Landhuis | Parklaan, De Heuvels |
| Privé-eiland | Privé-eiland |

**Studio's en appartementen zitten in een flat.** Eén gebouw, en jouw appartement is er één
van — je huisnummer staat op de deur. **Een huis of villa is van jou alleen:** welk pand dat
is hangt aan je spelerseed, dus jouw villa staat op een andere plek dan die van iemand
anders.

**Kopen doe je bij de deur.** Panden die binnen bereik liggen krijgen een Te Koop-bord met
de prijs. Open **Winkel → Woningen** om te zien wat er te koop staat en hoe ver het is; de
knop met de prijs zet de navigatiepijl erheen. Ter plekke koop je hem.

Je verhuist: je spullen gaan mee en je oude pand komt weer leeg te staan.

Het privé-eiland ligt los in zee en er is nog geen boot, dus daar kun je voorlopig niet
komen. Dat staat er ook bij in het scherm.
