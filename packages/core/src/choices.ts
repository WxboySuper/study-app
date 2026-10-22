import { createSeededRng, type Rng } from './fishing/roll';
import type { StudyCard } from './types';

/**
 * The answer choices of a card.
 *
 * Every question carries its OWN choices, the way Blooket does it: the
 * correct answer and the wrong answers the author wrote for that very
 * question. The app never borrows the answers of the other cards of the
 * deck, so a card always looks the same wherever it is asked.
 */
export interface ChoiceCard {
  /** The question (the front of the card). */
  question: string;
  /** The correct answer (the back of the card). */
  correct: string;
  /** The wrong answers of the author (0 to 3). */
  wrong: readonly string[];
}

/** The options of a multiple choice question, ready to be shown. */
export interface BuiltChoices {
  /** The options: the correct answer and the wrong ones, shuffled. */
  options: string[];
  /** The index of the correct option. */
  answerIndex: number;
}

/** The most wrong answers a card may carry. */
export const MAX_WRONG_ANSWERS = 3;

/** The fewest options of a multiple choice question. */
export const MIN_OPTIONS = 2;

/** The most options of a multiple choice question (the correct one + 3 wrong). */
export const MAX_OPTIONS = MAX_WRONG_ANSWERS + 1;

/**
 * Cleans the wrong answers of a card.
 *
 * The empty answers, the answers that repeat inside the same card and the
 * answers that are the correct one are dropped: they would make the question
 * unfair (two right answers) or unreadable (an empty button).
 */
export function normalizeWrongAnswers(
  wrong: readonly string[],
  correct: string,
): string[] {
  const answer = correct.trim();
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of wrong) {
    const value = entry.trim();
    if (value === '' || value === answer || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
    if (result.length >= MAX_WRONG_ANSWERS) {
      break;
    }
  }

  return result;
}

/**
 * `true` when the card can be asked as a multiple choice question.
 *
 * A card needs a correct answer and at least one wrong answer that is not
 * the correct answer. The other cards are self-graded cards.
 */
export function isPlayable(card: ChoiceCard): boolean {
  if (card.correct.trim() === '') {
    return false;
  }
  return normalizeWrongAnswers(card.wrong, card.correct).length > 0;
}

/**
 * Builds the options of a multiple choice question.
 *
 * The options are the correct answer and the wrong answers of the card (2 to
 * 4 of them), shuffled with the given random source: the correct answer is
 * never always in the same place.
 *
 * A card that is not playable (no wrong answer) still gets its options: the
 * correct answer alone. The caller decides what to do with it (a card
 * without wrong answers is a self-graded card).
 */
export function buildChoices(card: ChoiceCard, rng: Rng): BuiltChoices {
  const correct = card.correct.trim();
  const options = [correct, ...normalizeWrongAnswers(card.wrong, correct)];

  // Fisher-Yates, so every order is possible.
  for (let index = options.length - 1; index > 0; index -= 1) {
    const other = rng.int(0, index);
    const current = options[index];
    const swap = options[other];
    if (current !== undefined && swap !== undefined) {
      options[index] = swap;
      options[other] = current;
    }
  }

  return { options, answerIndex: options.indexOf(correct) };
}

/**
 * Builds the cards that can be asked.
 *
 * The options of every card are built from its own wrong answers, and they
 * are shuffled with a seed that comes from the id of the card: the same card
 * always looks the same, and a new session does not shuffle the answers
 * under the player's feet.
 *
 * The cards without an answer are dropped (there is nothing to ask). The
 * cards without wrong answers keep their single option: they are the
 * self-graded ones.
 */
export function buildQuestionCards(cards: readonly StudyCard[]): StudyCard[] {
  const result: StudyCard[] = [];

  for (const card of cards) {
    if (card.back.trim() === '') {
      continue;
    }

    const built = buildChoices(
      { question: card.front, correct: card.back, wrong: card.wrong ?? [] },
      createSeededRng(hash(card.id)),
    );

    result.push({
      ...card,
      choices: built.options,
      answerIndex: built.answerIndex,
    });
  }

  return result;
}

/** A stable number for a string (djb2). */
function hash(value: string): number {
  let result = 5381;
  for (let index = 0; index < value.length; index += 1) {
    result = ((result << 5) + result + value.charCodeAt(index)) >>> 0;
  }
  return result;
}
