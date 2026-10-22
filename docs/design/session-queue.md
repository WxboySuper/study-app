# The session queue

The fishing mode asks one question at a time. `packages/core/src/sessionQueue.ts`
decides which question comes next, in which order, and when a mastery session is
over.

The design is a port of [Anki](https://github.com/ankitects/anki)'s scheduler,
adapted to a game with no clock:

| Anki | The game |
| --- | --- |
| New, learning and review queues | The same three queues, kept per session |
| Learning steps in minutes (`1`, `10`) | Question gaps: 1 minute ≈ 3 questions, 10 minutes ≈ 10 |
| Relearning after a lapse | A miss comes back after 3–5 questions |
| Graduating interval in days | Far to the back of the session (or out of it) |
| Sibling burying | Opt-in through `SessionQuestion.siblingKey` |
| Review intervals in days | `ts-fsrs` still computes the real next day |

## What the queue guarantees

- **The whole deck is eligible.** There is no small working set: new cards keep
  appearing while any remain, and review cards are mixed in steadily.
- **No repeats inside the gap.** A question is never asked again within
  `MASTERY_MIN_GAP` (3) questions, unless the deck is too small to avoid it.
- **A miss returns soon.** `Again` resets the card to the short relearn step,
  so it is asked again after about 3–5 questions.
- **A correct answer grows the interval.** The first correct answer follows the
  learning steps; after graduation the review interval grows by at least a day
  per correct answer.
- **Well-known cards stay rare.** In endless mode a card with a stability above
  `highStabilityDays` (30) is picked only about 15 % of the time when normal
  review cards are available.
- **Mastery still needs three in a row.** A question leaves a mastery session
  only after `MASTERY_REQUIRED_CORRECT` (3) correct answers in a row.

## Attribution

The folder `packages/core/src/anki/` is an original TypeScript implementation of
Anki's scheduler and queue design. It is distributed under the GNU Affero
General Public License, version 3 or later, to match the design it ports:

- [`packages/core/src/anki/LICENSE`](../../packages/core/src/anki/LICENSE)
- [`packages/core/src/anki/NOTICE`](../../packages/core/src/anki/NOTICE)

The real-day intervals come from the MIT-licensed
[`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) package.

## Tests

`packages/core/test/sessionQueue.test.ts` covers the guarantees above: growing
intervals after correct answers, the short return of a missed question, steady
new-card mixing, early coverage of a 60-question deck, the rarity of
high-stability cards in endless mode and the minimum gap between two serves.
