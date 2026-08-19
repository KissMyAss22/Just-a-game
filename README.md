# Just a Game

Een mobiele **3D idle city game** gebouwd met Expo (React Native) en een
zelf-gehoste Node-server.

> Je hebt een **base** in een fictieve stad. Items spawnen random door de stad,
> je haalt ze op (actief inkomen), plaatst ze in je base en koopt huizen, auto's
> en luxe die **passief inkomen** genereren — ook als de app dicht is.
> Elk seizoen is er een **season pass** met een gratis en een premium spoor.

---

## Snel starten

Vereisten: **Node 20+**, **pnpm 10+**, **Docker** en de **Expo Go**-app op je telefoon.

```bash
pnpm setup          # controleert Node, pnpm en Docker en vult je instellingen in
pnpm install        # eenmalig, duurt een paar minuten
pnpm db:up          # database starten
pnpm db:migrate     # tabellen aanmaken en de stad vullen met items
pnpm dev:server     # de server - laat dit venster open staan
```

En in een **tweede** terminalvenster:

```bash
pnpm dev:mobile     # toont een QR-code, scan die met Expo Go
```

**Uitgebreide handleiding met oplossingen als er iets misgaat:
[`docs/SPELEN.md`](docs/SPELEN.md).**

Scan de QR-code met Expo Go. Zorg dat je telefoon op **hetzelfde wifi-netwerk**
zit als je computer.

### De app naar jouw server laten wijzen

`pnpm setup` zoekt zelf het IP-adres van je computer op en zet dat in
`apps/mobile/.env`. Verhuis je naar een ander wifi-netwerk, draai hem dan
opnieuw.

Komt je telefoon er niet bij, dan is het bijna altijd de firewall, een VPN of
gasten-wifi. `docs/SPELEN.md` loopt dat stap voor stap na.

---

## Structuur

```
apps/
  mobile/     Expo-app (expo-router + react-three-fiber)
  server/     Fastify + Prisma + PostgreSQL
packages/
  shared/     stadslayout, item-/property-/voertuigdefinities,
              economie-formules en zod-schemas — gedeeld door app en server
infra/
  docker-compose.yml
```

`packages/shared` is bewust de kern van het project: de **economie-formules en
de stad staan er één keer** en worden door zowel de client (voor de UI) als de
server (als autoriteit) gebruikt. De server blijft altijd de baas — de client
mag voorspellen, maar nooit beslissen.

---

## Handige commando's

| Commando | Wat het doet |
|---|---|
| `pnpm dev:server` | Start de API + game-server met hot reload |
| `pnpm dev:mobile` | Start de Expo dev-server |
| `pnpm setup` | Controleert je computer en vult de instellingen in |
| `pnpm db:up` / `pnpm db:down` | Start/stop Postgres + Redis |
| `pnpm db:migrate` | Voert migraties uit en vult de stad met items |
| `pnpm --filter @game/server db:dev` | Nieuwe migratie maken na een schemawijziging |
| `pnpm db:studio` | Prisma Studio: bekijk de database in je browser |
| `pnpm test` | Draait de tests op de economie-formules |
| `pnpm balance` | Simuleert een speler en toont de progressiecurve |
| `pnpm typecheck` | TypeScript-check over de hele workspace |

---

## Ontwikkelstatus

| Fase | Inhoud | Status |
|---|---|---|
| 0 | Monorepo, server, 3D-scene op je telefoon | ✅ |
| 1 | Speelbare kern: stad, lopen, items, base, offline inkomen | ✅ |
| 2 | Boosts, manager, craften, personage met naam en uiterlijk | ✅ |
| 2b | Rebirth met erfenis en permanente voordelen | ✅ |
| 2c | Base-indeling: spullen op echte plekken in je woning | ✅ |
| 2d | Balansronde: simulatie gebouwd, eerste ronde gedaan | ✅ |
| 2e | Meubilair laat in het spel relevant houden | 🚧 |
| 3 | Alle districten, streaming, rijdbare voertuigen | ⬜ |
| 4 | Multiplayer, chat, profielen, leaderboards | ⬜ |
| 5 | Season pass live-ops, quests, events | ⬜ |
| 6 | IAP, analytics, App Store | ⬜ |

Zie `docs/GAME_DESIGN.md` voor het volledige ontwerp.
---

## Wat er nu al werkt

- Een 3D-stad van 1 km² met tien districten, gegenereerd uit data — client en
  server kennen exact dezelfde stad.
- Rondlopen met een joystick, camera draaien en zoomen, botsen tegen gebouwen.
- Items die door de server willekeurig door de stad worden neergelegd en die je
  automatisch oppakt als je erlangs loopt.
- Een base met woningen, geplaatste items, upgrades en een kluis die volloopt —
  ook als de app dicht is.
- Winkel met base-upgrades, negen woningen en tien voertuigen.
- Season pass met 50 tiers, een gratis en een premium spoor, plus dagelijkse en
  wekelijkse opdrachten.
- Een werkbank waar materialen die je vindt interieur worden dat elk uur geld
  oplevert — acht recepten van level 2 tot 34.
- Boosts die je met gems koopt, en een manager die je kluis automatisch leegt
  tegen commissie.
- Een eigen personage: naam en uiterlijk die je kiest en die je in de stad ziet
  rondlopen.
- Rebirth: ruil je hele voortgang in voor erfenis en koop daarmee permanente
  voordelen. Elke volgende rebirth vraagt vanzelf meer dan de vorige.
- Je woning inrichten in 3D: elk meubel staat op een echte plek, grote stukken
  nemen meer ruimte in, en een volle kamer levert tot 25% extra inkomen op.
- Een grootboek waarin elke munt herleidbaar is, en server-side controles tegen
  teleporteren, dubbel oprapen en klok-manipulatie.

Wat er nog niet is — en waarom — staat in `docs/GAME_DESIGN.md`.

