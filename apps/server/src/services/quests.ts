import {
  DAILY_QUEST_COUNT,
  QUESTS_BY_ID,
  RARITIES,
  WEEKLY_QUEST_COUNT,
  dayIndex,
  getItem,
  pickQuests,
  type QuestDef,
  type QuestMetric,
  type QuestScope,
  weekIndex,
} from '@game/shared';
import { GameError } from '../lib/errors.js';
import { grant, type Tx } from './ledger.js';

function periodFor(scope: QuestScope, now: Date): number {
  return scope === 'daily' ? dayIndex(now.getTime()) : weekIndex(now.getTime());
}

/**
 * Zorgt dat de speler quests heeft voor de huidige dag en week. De set is
 * deterministisch afgeleid van zijn seed, dus we kunnen hem altijd
 * herberekenen — de database bewaart alleen de voortgang.
 */
export async function ensureQuests(
  tx: Tx,
  playerId: string,
  playerSeed: number,
  now: Date,
): Promise<{ quest: QuestDef; periodIndex: number }[]> {
  const active: { quest: QuestDef; periodIndex: number }[] = [];

  for (const scope of ['daily', 'weekly'] as const) {
    const periodIndex = periodFor(scope, now);
    for (const quest of pickQuests(scope, playerSeed, periodIndex)) {
      active.push({ quest, periodIndex });
    }
  }

  const existing = await tx.questProgress.findMany({
    where: {
      playerId,
      OR: active.map(({ quest, periodIndex }) => ({ questId: quest.id, periodIndex })),
    },
    select: { questId: true, periodIndex: true },
  });
  const known = new Set(existing.map((e) => `${e.questId}:${e.periodIndex}`));

  const missing = active.filter(({ quest, periodIndex }) => !known.has(`${quest.id}:${periodIndex}`));
  if (missing.length > 0) {
    await tx.questProgress.createMany({
      data: missing.map(({ quest, periodIndex }) => ({
        playerId,
        questId: quest.id,
        scope: quest.scope,
        periodIndex,
        progress: 0,
      })),
      skipDuplicates: true,
    });
  }

  return active;
}

export interface TrackOptions {
  /** Voor 'collect_rarity': welk item is opgepakt. */
  itemId?: string;
}

/**
 * Verhoogt de voortgang van alle lopende quests die op deze gebeurtenis
 * letten. Alleen de metric bepaalt of een quest meetelt — zo hoeft de rest
 * van de server niets van quests te weten.
 */
export async function trackQuest(
  tx: Tx,
  playerId: string,
  playerSeed: number,
  now: Date,
  metric: QuestMetric,
  amount: number,
  options: TrackOptions = {},
): Promise<void> {
  if (amount <= 0) return;
  const active = await ensureQuests(tx, playerId, playerSeed, now);

  for (const { quest, periodIndex } of active) {
    if (quest.metric !== metric) continue;

    if (metric === 'collect_rarity') {
      if (!options.itemId || !quest.rarity) continue;
      const item = getItem(options.itemId);
      if (RARITIES.indexOf(item.rarity) < RARITIES.indexOf(quest.rarity)) continue;
    }

    await tx.questProgress.updateMany({
      where: { playerId, questId: quest.id, periodIndex, claimed: false },
      data: { progress: { increment: Math.round(amount) } },
    });
  }
}

export interface QuestView {
  id: string;
  name: string;
  description: string;
  scope: QuestScope;
  target: number;
  progress: number;
  seasonXp: number;
  claimed: boolean;
  completed: boolean;
}

export async function questViews(
  tx: Tx,
  playerId: string,
  playerSeed: number,
  now: Date,
): Promise<QuestView[]> {
  const active = await ensureQuests(tx, playerId, playerSeed, now);
  const rows = await tx.questProgress.findMany({
    where: {
      playerId,
      OR: active.map(({ quest, periodIndex }) => ({ questId: quest.id, periodIndex })),
    },
  });
  const byKey = new Map(rows.map((r) => [`${r.questId}:${r.periodIndex}`, r]));

  return active.map(({ quest, periodIndex }) => {
    const row = byKey.get(`${quest.id}:${periodIndex}`);
    const progress = Math.min(quest.target, row?.progress ?? 0);
    return {
      id: quest.id,
      name: quest.name,
      description: quest.description,
      scope: quest.scope,
      target: quest.target,
      progress,
      seasonXp: quest.seasonXp,
      claimed: row?.claimed ?? false,
      completed: progress >= quest.target,
    };
  });
}

/** Int de beloning van een afgeronde quest. Geeft de season-XP terug. */
export async function claimQuest(
  tx: Tx,
  playerId: string,
  playerSeed: number,
  now: Date,
  questId: string,
): Promise<{ seasonXp: number; quest: QuestDef }> {
  const quest = QUESTS_BY_ID[questId];
  if (!quest) throw new GameError('Onbekende quest.', 404, 'quest_not_found');

  const periodIndex = periodFor(quest.scope, now);
  const row = await tx.questProgress.findUnique({
    where: { playerId_questId_periodIndex: { playerId, questId, periodIndex } },
  });
  if (!row) throw new GameError('Deze quest loopt niet meer.', 400, 'quest_inactive');
  if (row.claimed) throw new GameError('Al opgehaald.', 400, 'quest_claimed');
  if (row.progress < quest.target) {
    throw new GameError('Deze quest is nog niet af.', 400, 'quest_incomplete');
  }

  // Voorwaardelijke update: twee gelijktijdige claims kunnen niet allebei slagen.
  const affected = await tx.questProgress.updateMany({
    where: { playerId, questId, periodIndex, claimed: false },
    data: { claimed: true },
  });
  if (affected.count === 0) throw new GameError('Al opgehaald.', 400, 'quest_claimed');

  if (quest.reward?.kind === 'gems') {
    await grant(tx, playerId, 'gems', quest.reward.amount, 'quest_reward', { questId });
  } else if (quest.reward?.kind === 'cash') {
    await grant(tx, playerId, 'cash', quest.reward.amount, 'quest_reward', { questId });
  }

  return { seasonXp: quest.seasonXp, quest };
}

export const QUEST_COUNTS = { daily: DAILY_QUEST_COUNT, weekly: WEEKLY_QUEST_COUNT };
