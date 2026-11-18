import { State, fsrs } from 'ts-fsrs';

import { isMatureMastered } from './mastery';
import type { CardState } from './types';

export interface ExamPlan {
  classId: string;
  date: string;
}

export interface ExamCard {
  id: string;
  deckId: string;
  state: CardState | undefined;
  retired: boolean;
}

export interface Readiness {
  percent: number;
  total: number;
  mastered: number;
  learning: number;
  unseen: number;
}

const DAY_MS = 86_400_000;

/** Returns the calendar day difference between two YYYY-MM-DD dates. */
export function daysUntil(date: string, today: string): number {
  const target = Date.parse(`${date}T00:00:00.000Z`);
  const current = Date.parse(`${today}T00:00:00.000Z`);
  if (!Number.isFinite(target) || !Number.isFinite(current)) return 0;
  return Math.round((target - current) / DAY_MS);
}

/** Estimates how much of a card pool is currently retrievable. */
export function readiness(cards: readonly ExamCard[], now: Date): Readiness {
  const scheduler = fsrs();
  let total = 0;
  let mastered = 0;
  let learning = 0;
  let unseen = 0;
  let score = 0;

  for (const card of cards) {
    if (card.retired) continue;
    total += 1;
    const state = card.state;
    if (isMatureMastered(state)) {
      mastered += 1;
      score += 1;
      continue;
    }

    if (state === undefined || state.state === State.New) {
      unseen += 1;
      continue;
    }
    if (state.state === State.Learning || state.state === State.Relearning) {
      learning += 1;
    }

    if (state.lastReview !== null && state.stability > 0) {
      const elapsedDays = Math.max(0, (now.getTime() - state.lastReview) / DAY_MS);
      const retrievability = scheduler.forgetting_curve(elapsedDays, state.stability);
      score += Math.min(0.899999, Math.max(0, retrievability));
    }
  }

  return {
    percent: total === 0 ? 0 : Math.round((score / total) * 100),
    total,
    mastered,
    learning,
    unseen,
  };
}

/** Returns the least-ready decks first. */
export function weakDecks(
  cards: readonly ExamCard[],
  now: Date,
  limit: number,
): Array<{ deckId: string; percent: number }> {
  const byDeck = new Map<string, ExamCard[]>();
  for (const card of cards) {
    if (card.retired) continue;
    const group = byDeck.get(card.deckId) ?? [];
    group.push(card);
    byDeck.set(card.deckId, group);
  }

  return [...byDeck.entries()]
    .map(([deckId, deckCards]) => ({ deckId, percent: readiness(deckCards, now).percent }))
    .sort((a, b) => a.percent - b.percent || a.deckId.localeCompare(b.deckId))
    .slice(0, Math.max(0, Math.floor(limit)));
}

export function examPace(input: {
  total: number;
  mastered: number;
  unseen: number;
}, daysLeft: number): { cardsPerDay: number; label: string } {
  if (input.total <= input.mastered) {
    return { cardsPerDay: 0, label: 'You are ready for exam day' };
  }
  const remaining = Math.max(0, Math.min(input.unseen, input.total - input.mastered));
  if (remaining === 0) return { cardsPerDay: 0, label: 'No new cards left to learn' };
  const days = Math.max(0, Math.floor(daysLeft));
  const cardsPerDay = days === 0 ? remaining : Math.ceil(remaining / days);
  const label = days === 0
    ? `Learn ${cardsPerDay} new ${cardsPerDay === 1 ? 'card' : 'cards'} today to be ready`
    : `Learn ${cardsPerDay} new ${cardsPerDay === 1 ? 'card' : 'cards'} a day to be ready`;
  return { cardsPerDay, label };
}

export function examHeadline(percent: number, daysLeft: number): string {
  const days = Math.max(0, Math.floor(daysLeft));
  return `Exam in ${days} ${days === 1 ? 'day' : 'days'} · ${Math.max(0, Math.min(100, Math.round(percent)))}% ready`;
}
