import { CATCHES, findCatch } from '../../src/fishing/catches';
import type { Rng } from '../../src/fishing/roll';
import type { QueueItem, QueueItemKind } from '../../src/queue';
import type { StudyCard } from '../../src/types';

/**
 * An RNG that plays a fixed script. Every call takes the next value of the
 * script, so a test can say exactly which tier comes out.
 */
export function sequenceRng(values: readonly number[]): Rng {
  let index = 0;
  const take = (): number => {
    const value = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
  return {
    next: take,
    int: (min: number, max: number): number => min + Math.floor(take() * (max - min + 1)),
  };
}

/** An RNG that always returns the same value. */
export function fixedRng(value: number): Rng {
  return sequenceRng([value]);
}

/**
 * A queue item for the tests: a multiple choice card with four answers.
 */
export function makeQueueItem(
  id: string,
  options: {
    bonus?: boolean;
    kind?: QueueItemKind;
    choices?: string[] | null;
    /** `null` builds a card without choices, `null` on the answer as well. */
    answerIndex?: number | null;
    /** The wrong answers of the card (they belong to the card). */
    wrong?: string[] | null;
    setId?: string;
  } = {},
): QueueItem {
  const choices = options.choices === null ? undefined : (options.choices ?? ['alpha', 'beta', 'gamma', 'delta']);
  const answerIndex = options.answerIndex === null ? undefined : (options.answerIndex ?? 0);
  const wrong = options.wrong === null ? undefined : (options.wrong ?? ['beta', 'gamma', 'delta']);
  const card: StudyCard = {
    id,
    setId: options.setId ?? 'set-1',
    type: 'mc',
    front: `front of ${id}`,
    back: `back of ${id}`,
    ...(choices === undefined ? {} : { choices }),
    ...(answerIndex === undefined ? {} : { answerIndex }),
    ...(wrong === undefined ? {} : { wrong }),
  };

  return {
    cardId: id,
    card,
    kind: options.kind ?? 'due',
    bonus: options.bonus ?? false,
  };
}

/** Looks a catch up (fails the test when it does not exist). */
export function findsCatch(id: string) {
  const found = findCatch(id);
  if (found === undefined) {
    throw new Error(`Unknown catch: ${id}`);
  }
  return found;
}

/** Every catch id, useful to check the catalogue. */
export function allCatchIds(): string[] {
  return CATCHES.map((entry) => entry.id);
}
