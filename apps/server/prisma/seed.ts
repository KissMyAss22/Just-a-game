import { DISTRICTS } from '@game/shared';
import { disconnectPrisma, prisma } from '../src/lib/prisma.js';
import { repairAllPlacements } from '../src/services/home.js';
import { ensureSpawns, spawnCounts } from '../src/services/spawner.js';

/**
 * De definities van items, woningen en voertuigen staan in code, niet in de
 * database. Seeden betekent hier dus vooral: de stad alvast vullen met items,
 * zodat je bij de eerste start meteen iets ziet liggen.
 */
async function main(): Promise<void> {
  console.log('Stad vullen met items...');
  const { created, removed } = await ensureSpawns();
  console.log(`  ${created} nieuwe spawns, ${removed} verlopen spawns opgeruimd`);

  const counts = await spawnCounts();
  for (const district of DISTRICTS) {
    console.log(`  ${district.name.padEnd(18)} ${counts[district.id] ?? 0}`);
  }

  // Na een migratie kan inrichting op een ongeldige plek staan; hier krijgt
  // alles alsnog een kloppende plek in de kamer.
  const repair = await repairAllPlacements();
  if (repair.moved > 0 || repair.returned > 0) {
    console.log(
      `Inrichting rechtgezet: ${repair.moved} verplaatst, ${repair.returned} terug in de rugzak`,
    );
  }

  const players = await prisma.player.count();
  console.log(`Spelers in de database: ${players}`);
  console.log('Klaar.');
}

main()
  .catch((error) => {
    console.error('Seeden mislukt:', error);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
