import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseDeck } from '../src/import';
import { gradeMathAnswer, mathParts } from '../src/mathGrade';

const deck = readFileSync(join(__dirname, '../../../docs/samples/calculus.json'), 'utf8');

describe('the sample calculus deck', () => {
  const parsed = parseDeck(deck, 'calculus');

  it('imports with no errors, every question a math question', () => {
    expect(parsed.errors).toEqual([]);
    expect(parsed.cards.length).toBeGreaterThanOrEqual(20);
    expect(parsed.cards.every((card) => card.math !== undefined)).toBe(true);
  });

  it('accepts its own answers for every part', () => {
    for (const card of parsed.cards) {
      for (const part of mathParts(card.math!)) {
        for (const answer of part.answers) {
          const grade = gradeMathAnswer(part.answers, answer, { kind: part.kind, constant: part.constant });
          expect(grade, `${card.id}: ${answer}`).toEqual({ correct: true, invalid: false });
        }
      }
    }
  });

  it('accepts equivalent forms and rejects wrong ones', () => {
    const byId = new Map(parsed.cards.map((card) => [card.id, card.math!]));
    const final = (id: string) => mathParts(byId.get(id)!).at(-1)!;
    const check = (id: string, given: string) => {
      const part = final(id);
      return gradeMathAnswer(part.answers, given, { kind: part.kind, constant: part.constant }).correct;
    };
    expect(check('d-quotient', '(x+1)^-2')).toBe(true);
    expect(check('i-exp', '(1/3)e^(3x) + C')).toBe(true);
    expect(check('i-def', '2.6666666667')).toBe(true);
    expect(check('s-area', 'int(x*x, x, 0, 2)')).toBe(true);
    expect(check('s-area', 'int(x^2, x, 0, 3)')).toBe(false);
    expect(check('d-chain-steps', '5(3x^2+1)^4')).toBe(false);
  });
});
