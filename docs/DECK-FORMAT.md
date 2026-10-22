# Deck format

The app can import a deck that is **pasted as text**. This page is the spec:
follow it and the deck lands in the game as a normal deck of multiple choice
cards.

Two formats are supported: **JSON** and **line based** (TSV, `front :: back`
or `front | back`).

The importer lives in `packages/core/src/import.ts` (`parseDeck`) and the
screen that uses it is `apps/mobile/app/import.tsx`.

## The rules (all of them)

1. **One card per line.** A line is one card, never two.
2. **The first separator splits the line** into the front (the question) and
   the back (the answer). Everything after the separator is the back, even if
   it holds another separator.
3. **No header row.** The first line is a card, not a column name. Do not
   write `front,back` on top.
4. **Keep the backs short.** The back of a card becomes one of the multiple
   choice options of the game, together with the backs of the other cards of
   the deck. Long answers make the options unreadable, and answers that are
   too similar to each other make the game unfair.
5. **At least 4 cards.** The game asks multiple choice questions: the answer
   of the card plus three distractors that come from the other cards of the
   same deck. With fewer than 4 cards the questions are thin (the import
   screen warns about it).
6. **No empty sides.** A card needs a front *and* a back. A line with only
   one side is skipped and reported as an error.
7. **No duplicates.** Two cards with the same front *and* the same back are
   the same card: the second one is dropped.
8. **Blank lines and `#` comments are ignored.** A line that starts with `#`
   is a comment, so a deck can carry its own notes.
9. **Maximum 2000 cards** per deck.

## Format 1: JSON

```json
{
  "name": "European capitals",
  "cards": [
    { "front": "Capital of France", "back": "Paris" },
    { "front": "Capital of Japan", "back": "Tokyo" },
    { "front": "Capital of Italy", "back": "Rome" }
  ]
}
```

- The deck is detected as JSON when the text starts with `{`.
- `name` is optional: without it, the name the player typed in the app is
  used.
- `cards` is required. Every card needs a `front` and a `back` (strings).
- Extra fields are ignored, so a bigger file with metadata still imports.

## Format 2: line based

The separator of a line is the **first** of:

| Order | Separator | Example | Format |
| ----- | --------- | ------- | ------ |
| 1 | TAB | `Capital of France\tParis` | TSV |
| 2 | ` :: ` | `Capital of France :: Paris` | double colon |
| 3 | ` \| ` | `Capital of France \| Paris` | pipe |
| 4 | `::` | `Capital of France::Paris` | double colon |
| 5 | `\|` | `Capital of France\|Paris` | pipe |

`::` and `|` also work without the surrounding spaces; the spaced versions
are easier to read, so prefer them.

The spaces around the separator are optional and the two sides are trimmed.

### TSV (a spreadsheet paste)

Copy two columns from a spreadsheet and paste them: the columns are separated
by a TAB.

```
Capital of France	Paris
Capital of Japan	Tokyo
Capital of Italy	Rome
```

### Double colon

```
Capital of France :: Paris
Capital of Japan :: Tokyo
Capital of Italy :: Rome
```

### Pipe

```
Capital of France | Paris
Capital of Japan | Tokyo
Capital of Italy | Rome
```

## A deck with comments and blank lines

```
# European capitals — generated for the world history class
Capital of France :: Paris

Capital of Japan :: Tokyo
# Rome was not a capital in 1900, but it is today.
Capital of Italy :: Rome
```

## How to ask an AI assistant for a deck

Give it this instruction (it is the short version of this page):

> Write a deck of at least 8 flashcards about `<topic>`, one card per line, in
> the format `front :: back`. No header row, no numbering, no commentary.
> Every back must be a single short answer (max 6 words) that is different
> from the backs of the other cards, because the backs become the options of
> the multiple choice questions.

Then paste the answer in the app, name the deck and press **IMPORT DECK**.

## What the app does with the deck

- The deck appears in the deck picker of the home screen, and it is the deck
  that is selected when the import is done.
- Every card is a normal multiple choice card: the answer is the back of the
  card, the three distractors come from the other cards of the same deck.
- Every card starts as a **new** card, due right now, and the scheduler takes
  it from there.
- A deck can be deleted from the picker (the little bin on the card, or a long
  press on it): the deck, its cards and their reviews leave the game.
