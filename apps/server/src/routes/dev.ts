import {
  DISTRICTS_BY_ID,
  ITEMS,
  PROPERTIES,
  STARTER_PROPERTY_ID,
  STARTER_VEHICLE_ID,
  VEHICLES,
  devCurrencySchema,
  devGiveItemsSchema,
  devLevelSchema,
  devResetSchema,
  devSpawnSchema,
  devTeleportSchema,
  devTimeSkipSchema,
  devUnlockSchema,
  districtAtWorld,
  findSpawnPoint,
  getItem,
  getProperty,
  isWalkable,
  levelFromTotalXp,
  mulberry32,
  pickItemForDistrict,
  spawnPosition,
  weightedPick,
  xpForNextLevel,
  type DistrictId,
  type Rarity,
} from '@game/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';
import { authenticate, playerIdOf } from '../lib/auth.js';
import { GameError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { clearDummies, spawnDummy } from '../realtime/city.js';
import { grant } from '../services/ledger.js';
import { addItem, loadPlayer, settleVault, toPlayerStateDto } from '../services/player.js';

/**
 * Testgereedschap: alles wat je normaal moet verdienen, met één knop.
 *
 * Deze endpoints bestaan omdat de rest van het spel anders niet te testen is.
 * Een nieuwe woning bekijken zou uren spelen kosten; een offline-inkomstenbug
 * zou een nacht wachten kosten. Dat is geen ontwikkelen, dat is wachten.
 *
 * Drie regels waar niet vanaf geweken wordt:
 *
 *  1. Alles zit achter `env.devTools`, en dat kan in productie niet aan.
 *     Eén verkeerde .env mag geen gratis-geldknop op internet zetten.
 *  2. Elke muntmutatie gaat door het grootboek, met reden `dev_*`. Zo is
 *     later terug te zien dat een bedrag uit een testknop kwam en niet uit
 *     een lek in de economie.
 *  3. Bijgeschreven geld telt níét mee voor je levenslange opbrengst. Dat is
 *     de grondslag van de rebirth-formule; die met testgeld vervuilen maakt
 *     elke balansmeting waardeloos.
 */

/** Weigert alles zolang het gereedschap niet aan staat. */
async function requireDevTools(_request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!env.devTools) {
    throw new GameError(
      'Het ontwikkelgereedschap staat uit. Zet DEV_TOOLS=1 in apps/server/.env en herstart de server.',
      403,
      'dev_tools_off',
    );
  }
}

const guard = [authenticate, requireDevTools];

/** Totale XP die bij een level hoort: alle drempels tot dat level opgeteld. */
function totalXpForLevel(level: number): number {
  let total = 0;
  for (let step = 1; step < level; step++) {
    const needed = xpForNextLevel(step);
    if (!Number.isFinite(needed)) break;
    total += needed;
  }
  return total;
}

/**
 * Het dichtstbijzijnde punt waar je kunt staan.
 *
 * Een teleport naar losse coördinaten kan midden in een gebouw of in het
 * water uitkomen. Dan lopen we in ringen naar buiten tot er iets begaanbaars
 * is, in plaats van de speler in een muur te zetten en hem daar te laten
 * trillen.
 */
function nearestWalkable(x: number, z: number): { x: number; z: number } | null {
  if (isWalkable(x, z, 0.45)) return { x, z };
  for (let ring = 1; ring <= 24; ring++) {
    const radius = ring * 2.5;
    for (let step = 0; step < ring * 8; step++) {
      const angle = (step / (ring * 8)) * Math.PI * 2;
      const px = x + Math.cos(angle) * radius;
      const pz = z + Math.sin(angle) * radius;
      if (isWalkable(px, pz, 0.45)) return { x: px, z: pz };
    }
  }
  return null;
}

export async function devRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Staat het gereedschap aan?
   *
   * Dit is het enige endpoint zonder de guard: de app moet kunnen vertellen
   * dát het uitstaat, in plaats van bij elke knop een foutmelding te geven.
   */
  app.get('/dev', { preHandler: authenticate }, async () => ({
    enabled: env.devTools,
    serverTime: Date.now(),
  }));

  /** Items in je rugzak. Zonder itemId krijg je van alles evenveel. */
  app.post('/dev/items', { preHandler: guard }, async (request) => {
    const playerId = playerIdOf(request);
    const body = devGiveItemsSchema.parse(request.body ?? {});
    const now = new Date();
    const targets = body.itemId ? [getItem(body.itemId)] : ITEMS;

    return prisma.$transaction(async (tx) => {
      for (const item of targets) await addItem(tx, playerId, item.id, body.quantity);
      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return {
        given: targets.length * body.quantity,
        kinds: targets.length,
        state: toPlayerStateDto(refreshed, accrual, now),
      };
    });
  });

  /** Cash, gems of erfenis bijschrijven. */
  app.post('/dev/currency', { preHandler: guard }, async (request) => {
    const playerId = playerIdOf(request);
    const body = devCurrencySchema.parse(request.body ?? {});
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      // `countsAsEarnings = false`: testgeld mag de erfenisformule niet voeden.
      if (body.cash > 0) await grant(tx, playerId, 'cash', body.cash, 'dev_cash', undefined, false);
      if (body.gems > 0) await grant(tx, playerId, 'gems', body.gems, 'dev_gems');
      if (body.erfenis > 0) await grant(tx, playerId, 'erfenis', body.erfenis, 'dev_erfenis');

      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return toPlayerStateDto(refreshed, accrual, now);
    });
  });

  /**
   * Rechtstreeks naar een level.
   *
   * Zonder de gebruikelijke levelbeloningen: die zouden bij een sprong naar
   * level 40 een fortuin uitkeren, en dat maakt elke balansmeting daarna
   * waardeloos. Wil je die beloningen testen, speel dan één level omhoog.
   */
  app.post('/dev/level', { preHandler: guard }, async (request) => {
    const playerId = playerIdOf(request);
    const body = devLevelSchema.parse(request.body);
    const now = new Date();
    const xp = totalXpForLevel(body.level);

    return prisma.$transaction(async (tx) => {
      await tx.player.update({
        where: { id: playerId },
        data: { xp, level: levelFromTotalXp(xp).level },
      });
      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return toPlayerStateDto(refreshed, accrual, now);
    });
  });

  /** Alle voertuigen erbij, en eventueel meteen een andere woning. */
  app.post('/dev/unlock', { preHandler: guard }, async (request) => {
    const playerId = playerIdOf(request);
    const body = devUnlockSchema.parse(request.body ?? {});
    const now = new Date();
    // Een onbekende woning-id moet stuklopen vóór de transactie, niet erin.
    const property = body.propertyId ? getProperty(body.propertyId) : null;

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      // Eerst afrekenen: een duurdere woning verhoogt het inkomen, en dat mag
      // niet met terugwerkende kracht over de afgelopen uren gelden.
      await settleVault(tx, loaded, now);

      if (body.vehicles) {
        for (const vehicle of VEHICLES) {
          await tx.playerVehicle.upsert({
            where: { playerId_vehicleId: { playerId, vehicleId: vehicle.id } },
            create: { playerId, vehicleId: vehicle.id },
            update: {},
          });
        }
      }
      if (property) {
        await tx.player.update({ where: { id: playerId }, data: { propertyId: property.id } });
      }

      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return toPlayerStateDto(refreshed, accrual, now);
    });
  });

  /**
   * Verspringen naar een plek of een wijk.
   *
   * De positie wordt door `resolveMovement` gehaald, zodat je nooit in een
   * muur of in het water landt — dat is geen anti-cheat maar gezond verstand.
   * De snelheidscontrole slaan we hier wél over: dat is precies het punt.
   */
  app.post('/dev/teleport', { preHandler: guard }, async (request) => {
    const playerId = playerIdOf(request);
    const body = devTeleportSchema.parse(request.body);
    const now = new Date();

    let target: { x: number; z: number };
    if (body.districtId) {
      const district = DISTRICTS_BY_ID[body.districtId as DistrictId];
      if (!district) throw new GameError('Die wijk bestaat niet.', 404, 'district_not_found');
      // Dezelfde puntenzoeker als de spawner: die levert altijd begaanbaar
      // terrein binnen de wijk op, ook als de rand water is.
      const point = findSpawnPoint(district.id, mulberry32(now.getTime() & 0xffff));
      if (!point) throw new GameError('Geen plek gevonden in die wijk.', 400, 'no_spot');
      target = point;
    } else {
      target = { x: body.x ?? 0, z: body.z ?? 0 };
    }

    const safe = nearestWalkable(target.x, target.z);
    if (!safe) {
      throw new GameError('Daar is nergens vaste grond in de buurt.', 400, 'no_spot');
    }

    await prisma.player.update({
      where: { id: playerId },
      data: { x: safe.x, z: safe.z, positionAt: now },
    });
    return { x: safe.x, z: safe.z, serverTime: now.getTime() };
  });

  /**
   * De kluisklok vooruitzetten.
   *
   * De echte tijd blijft ongemoeid; alleen `accruedAt` gaat naar het verleden.
   * Daarna doet de gewone inkomstenberekening zijn werk, inclusief de
   * offline-limiet en het kluisplafond. Je test dus de échte formule.
   */
  app.post('/dev/timeskip', { preHandler: guard }, async (request) => {
    const playerId = playerIdOf(request);
    const body = devTimeSkipSchema.parse(request.body);
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const loaded = await loadPlayer(tx, playerId);
      const shifted = new Date(loaded.player.accruedAt.getTime() - body.hours * 3_600_000);
      loaded.player = await tx.player.update({
        where: { id: playerId },
        data: { accruedAt: shifted },
      });

      const accrual = await settleVault(tx, loaded, now);
      const refreshed = await loadPlayer(tx, playerId);
      return {
        hours: body.hours,
        earned: Math.floor(accrual.earned),
        cappedByTime: accrual.cappedByTime,
        state: toPlayerStateDto(refreshed, accrual, now),
      };
    });
  });

  /** Items om je heen leggen, zodat je het oprapen kunt testen. */
  app.post('/dev/spawn', { preHandler: guard }, async (request) => {
    const body = devSpawnSchema.parse(request.body);
    const now = new Date();
    const rand = mulberry32(now.getTime() & 0xffff);

    const rows: {
      districtId: string;
      itemId: string;
      rarity: string;
      x: number;
      z: number;
      expiresAt: Date;
    }[] = [];

    // Een ring van punten om de speler heen; wat in een muur valt slaan we
    // over in plaats van te verschuiven, anders liggen ze allemaal op één hoop.
    for (let i = 0; i < body.count * 4 && rows.length < body.count; i++) {
      const angle = rand() * Math.PI * 2;
      const distance = 4 + rand() * (body.radius - 4);
      const x = body.x + Math.cos(angle) * distance;
      const z = body.z + Math.sin(angle) * distance;
      if (!isWalkable(x, z, 0.6)) continue;

      // De wijk waar het punt daadwerkelijk ligt, zodat de loot klopt bij
      // waar je staat — een containerhaven hoort geen villa-spullen te geven.
      const district = districtAtWorld(x, z);
      const rarity = weightedPick<Rarity>(district.rarityWeights, rand());
      const item = pickItemForDistrict(district.id, rarity, rand());
      if (!item) continue;

      rows.push({
        districtId: district.id,
        itemId: item.id,
        rarity,
        x,
        z,
        expiresAt: new Date(now.getTime() + 900_000),
      });
    }

    if (rows.length > 0) await prisma.spawn.createMany({ data: rows });
    return { created: rows.length, serverTime: now.getTime() };
  });

  /**
   * Terug naar nul, om het spel als nieuwe speler te bekijken.
   *
   * Wist ook de erfenis en de levenslange opbrengst: anders is het geen
   * nieuwe speler maar een nieuwe speler met voorsprong, en dat is precies
   * wat je niet wilt testen. Het grootboek blijft staan — dat is de
   * geschiedenis, en die gooi je niet weg.
   */
  /**
   * Een oefenpop naast je neerzetten.
   *
   * PvP bleef liggen omdat er een tweede speler voor nodig is, en een ronde die
   * je niet kunt beoordelen is niet af. De pop komt mee in de momentopname en
   * volgt exact dezelfde aanvalsregels als een speler — alleen valt er niets uit
   * als hij omgaat.
   *
   * Hij leeft alleen in het geheugen van de realtime-laag, dus hij verdwijnt bij
   * een herstart en na tien minuten vanzelf.
   */
  app.post('/dev/dummy', { preHandler: guard }, async (request) => {
    const playerId = playerIdOf(request);
    const player = await prisma.player.findUniqueOrThrow({
      where: { id: playerId },
      select: { x: true, z: true },
    });
    // Twee meter voor je neus: binnen slagafstand, en niet in je gezicht.
    const spot = nearestWalkable(player.x + 2, player.z) ?? { x: player.x, z: player.z };
    const pop = spawnDummy(spot.x, spot.z);
    return { ok: true, ...pop, x: spot.x, z: spot.z };
  });

  /** Alle oefenpoppen weghalen. */
  app.post('/dev/dummy/clear', { preHandler: guard }, async () => ({
    ok: true,
    removed: clearDummies(),
  }));

  app.post('/dev/reset', { preHandler: guard }, async (request) => {
    const playerId = playerIdOf(request);
    devResetSchema.parse(request.body);
    const now = new Date();
    const start = spawnPosition();

    return prisma.$transaction(async (tx) => {
      await tx.inventoryItem.deleteMany({ where: { playerId } });
      await tx.placement.deleteMany({ where: { playerId } });
      await tx.playerUpgrade.deleteMany({ where: { playerId } });
      await tx.playerVehicle.deleteMany({ where: { playerId } });
      await tx.playerBoost.deleteMany({ where: { playerId } });
      await tx.playerLegacy.deleteMany({ where: { playerId } });
      await tx.questProgress.deleteMany({ where: { playerId } });
      await tx.seasonProgress.deleteMany({ where: { playerId } });

      await tx.player.update({
        where: { id: playerId },
        data: {
          level: 1,
          xp: 0,
          cash: BigInt(0),
          gems: 0,
          lifetimeEarned: BigInt(0),
          erfenis: 0,
          erfenisClaimed: 0,
          rebirthCount: 0,
          propertyId: STARTER_PROPERTY_ID,
          vehicleId: STARTER_VEHICLE_ID,
          vaultBalance: BigInt(0),
          accruedAt: now,
          distanceTotal: 0,
          x: start.x,
          z: start.z,
          positionAt: now,
        },
      });

      const refreshed = await loadPlayer(tx, playerId);
      const accrual = await settleVault(tx, refreshed, now);
      return toPlayerStateDto(refreshed, accrual, now);
    });
  });

  /** Wat er te kiezen valt: wijken en woningen, met hun echte namen. */
  app.get('/dev/options', { preHandler: guard }, async () => ({
    districts: Object.values(DISTRICTS_BY_ID).map((d) => ({
      id: d.id,
      name: d.name,
      unlockLevel: d.unlockLevel,
    })),
    properties: PROPERTIES.map((p) => ({ id: p.id, name: p.name, tier: p.tier })),
  }));
}
