import { formatMoney } from '../src/economy';
import { getProperty } from '../src/properties';
import { DEFAULT_SIM_CONFIG, simulate, type SimConfig, type SimResult } from './simulate';

/**
 * Draait de balanssimulatie en print een tijdlijn.
 *
 *   pnpm balance                 standaardspeler, 30 dagen
 *   pnpm balance --days 60       langere horizon
 *   pnpm balance --minutes 20    een speler die minder speelt
 *   pnpm balance --no-rebirth    zonder rebirth, om die invloed te isoleren
 */

function parseArgs(argv: string[]): SimConfig {
  const config: SimConfig = { ...DEFAULT_SIM_CONFIG };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--days' && value) config.days = Number(value);
    if (flag === '--minutes' && value) config.activeMinutesPerDay = Number(value);
    if (flag === '--sessions' && value) config.sessionsPerDay = Number(value);
    if (flag === '--rate' && value) config.itemsPerMinute = Number(value);
    if (flag === '--seed' && value) config.seed = Number(value);
    if (flag === '--no-rebirth') config.allowRebirth = false;
  }
  return config;
}

/** Speeltijd, niet klokttijd: dat is de eenheid waarin een speler denkt. */
function playtime(minutes: number | null): string {
  if (minutes === null) return 'niet gehaald';
  if (minutes < 60) return `${Math.round(minutes)}m spelen`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}u ${m}m spelen`;
}

function clock(minute: number): string {
  const day = Math.floor(minute / (24 * 60)) + 1;
  const hour = Math.floor((minute % (24 * 60)) / 60);
  const min = minute % 60;
  return `d${String(day).padStart(2)} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const ICON: Record<string, string> = {
  upgrade: '🔧',
  property: '🏠',
  vehicle: '🚗',
  level: '⭐',
  rebirth: '🏛️',
  perk: '✨',
  note: '·',
};

/** De streefwaarden uit hoofdstuk 11 van het ontwerpdocument. */
interface Target {
  label: string;
  actual: string;
  ok: boolean;
  want: string;
}

function targets(result: SimResult): Target[] {
  const m = result.metrics;
  const check = (value: number | null, max: number) => value !== null && value <= max;
  return [
    {
      label: 'Eerste aankoop',
      actual: playtime(m.minutesToFirstPurchase),
      want: 'binnen 2m',
      ok: check(m.minutesToFirstPurchase, 2),
    },
    {
      label: 'Eerste eigen woning',
      actual: playtime(m.minutesToProperty.studio ?? null),
      want: 'binnen 15m',
      ok: check(m.minutesToProperty.studio ?? null, 15),
    },
    {
      label: 'Langste stilte',
      actual: playtime(m.longestGapMinutes),
      want: 'onder 20m',
      ok: m.longestGapMinutes <= 20,
    },
    {
      label: 'Level 20',
      actual: playtime(m.minutesToLevel20),
      want: '6-10u spelen',
      ok:
        m.minutesToLevel20 !== null &&
        m.minutesToLevel20 >= 6 * 60 &&
        m.minutesToLevel20 <= 10 * 60,
    },
    {
      label: 'Eerste rebirth',
      actual: playtime(m.minutesToFirstRebirth),
      want: '6-10u spelen',
      ok:
        m.minutesToFirstRebirth !== null &&
        m.minutesToFirstRebirth >= 6 * 60 &&
        m.minutesToFirstRebirth <= 10 * 60,
    },
    {
      label: '8 uur offline waard',
      actual: `${Math.round(m.offlineInActiveMinutes)}m spelen (mediaan)`,
      want: '30-60m',
      ok: m.offlineInActiveMinutes >= 30 && m.offlineInActiveMinutes <= 60,
    },
    {
      label: 'Aandeel actief inkomen',
      actual: `${Math.round(m.activeIncomeShare * 100)}%`,
      want: 'boven 10%',
      ok: m.activeIncomeShare >= 0.1,
    },
  ];
}

function main(): void {
  const config = parseArgs(process.argv.slice(2));
  const result = simulate(config);

  console.log('\n=== BALANSSIMULATIE ===');
  console.log(
    `${config.days} dagen · ${config.activeMinutesPerDay} min/dag in ${config.sessionsPerDay} sessies · ` +
      `${config.itemsPerMinute} items/min · rebirth ${config.allowRebirth ? 'aan' : 'uit'}`,
  );
  console.log(
    `Totaal ${Math.round((config.days * config.activeMinutesPerDay) / 60)} uur speeltijd gesimuleerd.\n`,
  );

  console.log('--- TIJDLIJN ---');
  let shown = 0;
  for (const event of result.events) {
    // Upgrades worden er honderden; alleen de eerste tien zijn interessant.
    if (event.kind === 'upgrade' && shown > 10) continue;
    if (event.kind === 'upgrade') shown++;
    console.log(
      `${clock(event.minute)}  ${ICON[event.kind] ?? '·'} ${event.label}${
        event.detail ? `  (${event.detail})` : ''
      }`,
    );
  }

  console.log('\n--- PER DAG ---');
  console.log('dag  level  woning        gevuld  inkomen/u     actief/u      cash');
  for (const day of result.daily) {
    if (day.day % Math.max(1, Math.floor(config.days / 15)) !== 0) continue;
    console.log(
      `${String(day.day).padStart(3)}  ${String(day.level).padStart(5)}  ` +
        `${getProperty(day.propertyId).name.padEnd(13)} ${String(day.placed).padStart(2)}/${String(
          day.slots,
        ).padEnd(3)}  ${formatMoney(day.incomePerHour).padStart(10)}  ` +
        `${formatMoney(day.activeIncomePerHour).padStart(10)}  ${formatMoney(day.cash).padStart(10)}`,
    );
  }

  console.log('\n--- STREEFWAARDEN ---');
  for (const target of targets(result)) {
    console.log(
      `${target.ok ? '✅' : '⚠️ '} ${target.label.padEnd(26)} ${target.actual.padEnd(18)} wil: ${target.want}`,
    );
  }

  const m = result.metrics;
  console.log('\n--- OVERIG ---');
  console.log(`Aankopen            ${m.purchases}`);
  console.log(`Rebirths            ${m.rebirths}`);
  console.log(`Eindlevel           ${m.finalLevel}`);
  console.log(`Eindinkomen         ${formatMoney(m.finalIncomePerHour)}/u`);
  console.log('');
}

main();
