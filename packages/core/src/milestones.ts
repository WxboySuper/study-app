/**
 * Mastery milestones: collectibles for real study progress.
 *
 * A deck crosses 50 %, 80 % and 100 % of its cards mastered (stable for 21+
 * days) once each. Each crossing pays a reward, so the collection follows the
 * studying instead of the luck of a fishing rod.
 */

/** The shares of a deck that pay a reward. */
export const MILESTONE_STEPS = [50, 80, 100] as const;

/** The smallest deck that can pay milestones (tiny decks are too easy to max). */
export const MILESTONE_MIN_CARDS = 25;

/** A deck as the milestones see it. */
export interface MilestoneDeck {
  id: string;
  title: string;
  /** How many cards (not retired) the deck holds. */
  total: number;
  /** How many of them are mastered. */
  mastered: number;
}

/** What a milestone pays. */
export interface MilestoneReward {
  tokens: number;
  packTickets: number;
}

/** A milestone that was just crossed. */
export interface Milestone {
  /** `deck:<id>:<step>`, stored so a milestone pays once. */
  key: string;
  deckId: string;
  deckTitle: string;
  step: (typeof MILESTONE_STEPS)[number];
  reward: MilestoneReward;
}

/** The reward of a step. */
export function rewardOf(step: (typeof MILESTONE_STEPS)[number]): MilestoneReward {
  switch (step) {
    case 50:
      return { tokens: 5, packTickets: 0 };
    case 80:
      return { tokens: 0, packTickets: 1 };
    case 100:
      return { tokens: 5, packTickets: 1 };
  }
}

/** The key of a milestone. */
export function milestoneKey(deckId: string, step: number): string {
  return `deck:${deckId}:${step}`;
}

/**
 * The milestones that were crossed and not paid yet.
 *
 * @param decks The decks with their mastered counts.
 * @param earned The keys that were already paid.
 */
export function newMilestones(
  decks: readonly MilestoneDeck[],
  earned: ReadonlySet<string>,
): Milestone[] {
  const out: Milestone[] = [];
  for (const deck of decks) {
    if (deck.total < MILESTONE_MIN_CARDS) {
      continue;
    }
    const share = (deck.mastered / deck.total) * 100;
    for (const step of MILESTONE_STEPS) {
      const key = milestoneKey(deck.id, step);
      if (share >= step && !earned.has(key)) {
        out.push({ key, deckId: deck.id, deckTitle: deck.title, step, reward: rewardOf(step) });
      }
    }
  }
  return out;
}

/** The sum of the rewards. */
export function totalReward(milestones: readonly Milestone[]): MilestoneReward {
  return milestones.reduce<MilestoneReward>(
    (sum, milestone) => ({
      tokens: sum.tokens + milestone.reward.tokens,
      packTickets: sum.packTickets + milestone.reward.packTickets,
    }),
    { tokens: 0, packTickets: 0 },
  );
}

/** The weekly goal: days of the week with the daily goal done. */
export const WEEKLY_TARGET_DAYS = 5;

/** The Monday of the ISO week of a YYYY-MM-DD day. */
function mondayOf(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return date.toISOString().slice(0, 10);
}

/**
 * The progress of the weekly goal.
 *
 * @param days The days (YYYY-MM-DD) whose daily goal was done.
 * @param today Today (YYYY-MM-DD).
 */
export function weeklyGoal(
  days: readonly string[],
  today: string,
): { done: number; target: number; chestReady: boolean } {
  const monday = mondayOf(today);
  const unique = new Set(days.filter((day) => mondayOf(day) === monday));
  return {
    done: unique.size,
    target: WEEKLY_TARGET_DAYS,
    chestReady: unique.size >= WEEKLY_TARGET_DAYS,
  };
}
