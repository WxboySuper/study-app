import { createSeededRng, type StudyCard } from '@study-app/core';

/**
 * Builds the multiple choice questions of the mode.
 *
 * The SPEC only knows multiple choice: four options, the distractors come
 * from the same set. Cards that already carry their options are kept as they
 * are, the others get three distractors from the other cards of their set.
 *
 * The order of the options is derived from the id of the card, so the same
 * card always looks the same (a new session does not shuffle the answers
 * under the player's feet).
 */

/** A stable number for a string (djb2). */
function hash(value: string): number {
  let result = 5381;
  for (let index = 0; index < value.length; index += 1) {
    result = ((result << 5) + result + value.charCodeAt(index)) >>> 0;
  }
  return result;
}

/** Shuffles a list with a seeded random source. */
function shuffle<T>(items: readonly T[], seed: number): T[] {
  const rng = createSeededRng(seed);
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = rng.int(0, index);
    const current = result[index];
    const swap = result[other];
    if (current !== undefined && swap !== undefined) {
      result[index] = swap;
      result[other] = current;
    }
  }
  return result;
}

/**
 * Turns the cards of the local store into cards that can be asked.
 *
 * Cards without an answer, or without a single distractor, are dropped: they
 * cannot be turned into a multiple choice question.
 */
export function buildQuestionCards(cards: readonly StudyCard[]): StudyCard[] {
  const bySet = new Map<string, StudyCard[]>();
  for (const card of cards) {
    const bucket = bySet.get(card.setId);
    if (bucket === undefined) {
      bySet.set(card.setId, [card]);
    } else {
      bucket.push(card);
    }
  }

  const result: StudyCard[] = [];

  for (const setCards of bySet.values()) {
    const answers = setCards
      .map((card) => card.back.trim())
      .filter((back) => back.length > 0)
      .sort();

    for (const card of setCards) {
      const answer = card.back.trim();
      if (answer.length === 0) {
        continue;
      }

      const choices = card.choices;
      const answerIndex = card.answerIndex;
      if (
        choices !== undefined &&
        choices.length >= 2 &&
        answerIndex !== undefined &&
        answerIndex >= 0 &&
        answerIndex < choices.length
      ) {
        result.push(card);
        continue;
      }

      const distractors = answers.filter((back) => back !== answer);
      const options = [answer, ...distractors].slice(0, 4);
      if (options.length < 2) {
        continue;
      }

      const shuffled = shuffle(options, hash(card.id));
      result.push({
        ...card,
        choices: shuffled,
        answerIndex: shuffled.indexOf(answer),
      });
    }
  }

  return result;
}
