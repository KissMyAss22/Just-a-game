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

Op Windows hoef je geen commando's te typen. In de map staan drie bestanden:

| Bestand | Wanneer |
|---|---|
| **INSTALLEER.bat** | een keer, de allereerste keer |
| **START.bat** | elke keer dat je wilt spelen |
| **STOP.bat** | als je klaar bent |

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

### De QR-code doet niets

Controleer of de Expo Go op je telefoon SDK 57 ondersteunt. Is je Expo Go oud,
werk hem dan bij in de App Store of Play Store.

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
