import { describe, expect, it } from 'vitest';

import { buildChoices, buildQuestionCards, isPlayable, normalizeWrongAnswers } from '../src/choices';
import { createSeededRng } from '../src/fishing/roll';
import type { StudyCard } from '../src/types';

function card(overrides: Partial<StudyCard> & { id: string }): StudyCard {
  return {
    setId: 'set_1',
    topicId: null,
    type: 'mc',
    front: 'a question',
    back: 'the answer',
    ...overrides,
  };
}

describe('isPlayable', () => {
  it('is playable with one wrong answer', () => {
    expect(isPlayable({ question: 'a', correct: 'b', wrong: ['c'] })).toBe(true);
  });

  it('is not playable without a wrong answer', () => {
    expect(isPlayable({ question: 'a', correct: 'b', wrong: [] })).toBe(false);
  });

  it('is not playable when the only wrong answer is the correct one', () => {
    expect(isPlayable({ question: 'a', correct: 'b', wrong: ['b'] })).toBe(false);
  });

  it('is not playable without an answer', () => {
    expect(isPlayable({ question: 'a', correct: '  ', wrong: ['c'] })).toBe(false);
  });
});

describe('normalizeWrongAnswers', () => {
  it('drops the empty, the repeated and the correct answers', () => {
    expect(
      normalizeWrongAnswers(['c', '  ', 'b', 'c', ' d '], 'b'),
    ).toEqual(['c', 'd']);
  });

  it('keeps at most three wrong answers', () => {
    expect(normalizeWrongAnswers(['c', 'd', 'e', 'f', 'g'], 'b')).toEqual(['c', 'd', 'e']);
  });
});

describe('buildChoices', () => {
  it('puts the correct answer and the wrong ones in the options', () => {
    const built = buildChoices(
      { question: 'a', correct: 'right', wrong: ['wrong one'] },
      createSeededRng(1),
    );

    expect(built.options).toHaveLength(2);
    expect(built.options.sort()).toEqual(['right', 'wrong one']);
    expect(built.options[built.answerIndex]).toBe('right');
  });

  it('never has more than four options', () => {
    const built = buildChoices(
      { question: 'a', correct: 'right', wrong: ['w1', 'w2', 'w3', 'w4'] },
      createSeededRng(7),
    );

    expect(built.options).toHaveLength(4);
    expect(built.options[built.answerIndex]).toBe('right');
  });

  it('shuffles the options', () => {
    const card = { question: 'a', correct: 'right', wrong: ['w1', 'w2', 'w3'] };
    const first = buildChoices(card, createSeededRng(1));
    const second = buildChoices(card, createSeededRng(1));

    expect(first.options).toEqual(second.options);
    expect(first.answerIndex).toBe(second.answerIndex);
    expect(first.options).toContain('right');
  });

  it('keeps the correct answer findable', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const built = buildChoices(
        { question: 'a', correct: 'right', wrong: ['w1', 'w2', 'w3'] },
        createSeededRng(seed),
      );

      expect(built.options[built.answerIndex]).toBe('right');
      expect(new Set(built.options).size).toBe(built.options.length);
    }
  });
});

describe('buildQuestionCards', () => {
  it('builds the options of a card from its own wrong answers', () => {
    const built = buildQuestionCards([
      card({ id: 'card_1', back: 'right', wrong: ['w1', 'w2'] }),
      card({ id: 'card_2', back: 'other', wrong: ['w3'] }),
    ]);

    expect([...(built[0]?.choices ?? [])].sort()).toEqual(['right', 'w1', 'w2']);
    expect(built[0]?.choices?.[built[0]?.answerIndex ?? -1]).toBe('right');
    expect([...(built[1]?.choices ?? [])].sort()).toEqual(['other', 'w3']);
    expect(built[1]?.choices?.[built[1]?.answerIndex ?? -1]).toBe('other');
  });

  it('never borrows the answers of the other cards', () => {
    const built = buildQuestionCards([
      card({ id: 'card_1', back: 'right', wrong: ['w1'] }),
      card({ id: 'card_2', back: 'other', wrong: [] }),
    ]);

    expect(built[1]?.choices).toEqual(['other']);
    expect(built[1]?.choices).not.toContain('right');
  });

  it('drops the cards without an answer', () => {
    const built = buildQuestionCards([card({ id: 'card_1', back: '   ' })]);

    expect(built).toEqual([]);
  });

  it('is stable: the same card always looks the same', () => {
    const cards = [card({ id: 'card_1', back: 'right', wrong: ['w1', 'w2', 'w3'] })];

    expect(buildQuestionCards(cards)[0]?.choices).toEqual(buildQuestionCards(cards)[0]?.choices);
  });
});
