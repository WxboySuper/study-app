import {
  isMatureMastered,
  newMilestones,
  totalReward,
  type Milestone,
  type MilestoneDeck,
} from '@study-app/core';

import { openLocalStore } from '@/db/local';

const EARNED_KEY = 'milestones-earned-v1';

async function readEarned(): Promise<Set<string>> {
  try {
    const store = await openLocalStore();
    const raw = await store.readKv(EARNED_KEY);
    if (raw === null) {
      return new Set();
    }
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Pays the milestones that were crossed since the last check.
 *
 * Looks at every deck, pays the tokens and tickets once and remembers which
 * milestones were paid. Never throws; an empty list means nothing was paid.
 */
export async function checkMilestones(): Promise<Milestone[]> {
  try {
    const store = await openLocalStore();
    const [sets, cards, states, earned] = await Promise.all([
      store.listSets(),
      store.listCards(),
      store.listCardStates(),
      readEarned(),
    ]);

    const decks: MilestoneDeck[] = sets.map((set) => {
      const own = cards.filter((card) => card.setId === set.id);
      return {
        id: set.id,
        title: set.title,
        total: own.length,
        mastered: own.filter((card) => isMatureMastered(states.get(card.id))).length,
      };
    });

    const fresh = newMilestones(decks, earned);
    if (fresh.length === 0) {
      return [];
    }

    // Remember first: a crash after this never pays twice.
    for (const milestone of fresh) {
      earned.add(milestone.key);
    }
    await store.writeKv(EARNED_KEY, JSON.stringify([...earned]));

    const reward = totalReward(fresh);
    if (reward.tokens > 0) {
      await store.addTokens(reward.tokens);
    }
    if (reward.packTickets > 0) {
      await store.addPackTickets(reward.packTickets);
    }
    return fresh;
  } catch {
    return [];
  }
}
