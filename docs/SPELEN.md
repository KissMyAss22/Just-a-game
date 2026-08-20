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
`Server listening at http://0.0.0.0:4000`.

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

De stad is 1.024 bij 1.024 meter. Aan de zuidkant en rond het privé-eiland ligt
zee; daar kun je niet heen lopen, en varen kan nog niet. Loop je vast tegen
water, dan is dat de kust en niet een fout.

Wil je zelf zien hoe groot hij is: zet in **Profiel → Ontwikkelgereedschap** de
vliegmodus aan. Je gaat dan dwars door alles heen en met de pijlen rechts in
beeld omhoog. Daarvoor moet je server wel met `DEV_TOOLS=1` draaien — zie
`apps/server/.env`.

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
