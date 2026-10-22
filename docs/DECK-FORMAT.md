# Deck format

The app can import a deck that is **pasted as text**. This page is the spec:
follow it and the deck lands in the game as a normal deck of cards.

Two formats are supported: **JSON** and **line based** (TSV, `::` or `|`).

Every question carries **its own wrong answers**, the way Blooket does it: the
author writes the distractors of every question, and the app **never** borrows
the answers of the other cards of the deck.

The importer lives in `packages/core/src/import.ts` (`parseDeck`) and the
screen that uses it is `apps/mobile/app/import.tsx`.

## The line format

```
question :: correct :: wrong1 :: wrong2 :: wrong3
```

- The **first field** is the question.
- The **second field** is always the correct answer.
- Then come **0 to 3 wrong answers** (the fields 3, 4 and 5).
- A card with 1 to 3 wrong answers is a **multiple choice** card (2 to 4
  choices).
- A card without wrong answers is a **self-graded** card (see "The rules of
  the game").

### The separator of a deck

The separator is detected on the **first card line** of the deck and is then
used for the **whole deck**: a deck never mixes two separators. The first
separator that is found wins:

| Order | Separator | Example | Format |
| ----- | --------- | ------- | ------ |
| 1 | TAB | `Capital of France\tParis\tMarseille` | TSV |
| 2 | ` :: ` | `Capital of France :: Paris :: Marseille` | double colon |
| 3 | `::` | `Capital of France::Paris::Marseille` | double colon |
| 4 | ` \| ` | `Capital of France \| Paris \| Marseille` | pipe |
| 5 | `\|` | `Capital of France\|Paris\|Marseille` | pipe |

`::` and `|` also work without the surrounding spaces; the spaced versions are
easier to read, so prefer them. The spaces around a separator are optional and
every field is trimmed.

## The rules (all of them)

1. **One card per line.** A line is one card, never two.
2. **The first answer is the correct one.** The field right after the question
   is the right answer, always. The wrong answers come after it.
3. **The wrong answers belong to their question.** They are written for that
   very card: the app never takes a distractor from another card of the deck.
4. **At most 3 wrong answers.** A card has one correct answer and up to three
   wrong ones, so it never has more than 4 choices. A line with more than 3
   wrong answers is an **error**: the line is reported with its line number
   and skipped.
5. **The wrong answers are cleaned.** A wrong answer that is the correct
   answer, or that repeats inside the same card, is **dropped**. It is not an
   error: the card simply has fewer choices.
6. **No header row.** The first line is a card, not a column name. Do not
   write `question,correct` on top.
7. **No empty sides.** A card needs a question *and* a correct answer. A line
   with an empty side is skipped and reported as an error.
8. **No duplicates.** Two cards with the same question *and* the same correct
   answer are the same card: the second one is dropped.
9. **Blank lines and `#` comments are ignored.** A line that starts with `#`
   is a comment, so a deck can carry its own notes.
10. **Maximum 2000 cards** per deck.

## Format 1: JSON

Three shapes are accepted. The deck is detected as JSON when the text starts
with `{`.

### The native shape

The question, the correct answer and the wrong answers of that question:

```json
{
  "name": "European capitals",
  "questions": [
    {
      "question": "Capital of France",
      "correct": "Paris",
      "wrong": ["Marseille", "Lyon", "Nice"]
    },
    {
      "question": "Capital of Italy",
      "correct": "Rome",
      "wrong": ["Milan", "Venice", "Naples"]
    }
  ]
}
```

- `name` is optional: without it, the name the player typed in the app is
  used.
- `wrong` is optional too. A question without wrong answers is imported as a
  **self-graded** card.
- `wrong` accepts a list of strings (or a single string).

### The Blooket shape

The answers of the question in one list, and the correct one by its index:

```json
{
  "questions": [
    {
      "question": "Capital of France",
      "answers": ["Paris", "Marseille", "Lyon", "Nice"],
      "correct": 0
    }
  ]
}
```

- `correct` is the **index** of the right answer in `answers` (the first one
  is `0`).
- `correct` can also be the answer **as a string** (`"correct": "Paris"`).
- The other answers of the list become the wrong answers of the question.

### The legacy shape

Still accepted: cards with a front and a back, and no wrong answers. They are
imported as **self-graded** cards.

```json
{
  "name": "European capitals",
  "cards": [
    { "front": "Capital of France", "back": "Paris" },
    { "front": "Capital of Japan", "back": "Tokyo" }
  ]
}
```

Extra fields are ignored, so a bigger file with metadata still imports.

## Format 2: line based

### TSV (a spreadsheet paste)

Copy the columns from a spreadsheet and paste them: the columns are separated
by a TAB.

```
Capital of France	Paris	Marseille	Lyon	Nice
Capital of Japan	Tokyo	Kyoto	Osaka	Sapporo
Capital of Italy	Rome	Milan	Venice	Naples
```

### Double colon

```
Capital of France :: Paris :: Marseille :: Lyon :: Nice
Capital of Japan :: Tokyo :: Kyoto :: Osaka :: Sapporo
Capital of Italy :: Rome :: Milan :: Venice :: Naples
```

### Pipe

```
Capital of France | Paris | Marseille | Lyon | Nice
Capital of Japan | Tokyo | Kyoto | Osaka | Sapporo
Capital of Italy | Rome | Milan | Venice | Naples
```

## A deck with comments and blank lines

```
# European capitals — generated for the world history class
Capital of France :: Paris :: Marseille :: Lyon :: Nice

Capital of Japan :: Tokyo :: Kyoto :: Osaka :: Sapporo
# Rome has been the capital of Italy since 1871.
Capital of Italy :: Rome :: Milan :: Venice :: Naples
```

## The rules of the game

- **The first answer after the question is always the correct one.**
- A card has **1 to 3 wrong answers**, so **2 to 4 choices** in total. Never
  more than 4 choices.
- **The choices are shuffled** when they are shown: the correct answer is not
  always in the same place.
- **The wrong answers are never taken from the other cards of the deck.**
  They are the ones the author wrote for that very question, so a card always
  looks the same wherever it is asked.
- A card **without wrong answers** is not asked as a multiple choice question:
  it becomes a **self-graded** card. The app shows the question, the player
  taps to reveal the answer and then taps **"Got it"** (graded **Good**) or
  **"Missed it"** (graded **Again**). Cards like that are flagged in the
  import preview.
- No empty sides, no duplicate cards (the same question and the same correct
  answer), max 2000 cards.

## The import preview

The import screen reads the deck live and shows what it found:

```
N questions · M multiple choice · K without wrong answers (will be self-graded)
```

- When `K > 0` a **yellow warning chip** is shown: those cards will be
  self-graded, not multiple choice.
- The **first 3 questions** are shown with their choices, so a bad paste is
  visible before the import.
- The lines that could not be read are listed with their line number.

## Instruction for an AI assistant

Give it this instruction (it is the short version of this page):

> Write at least 10 questions about `<topic>`, one question per line, in the
> format `question :: correct :: wrong1 :: wrong2 :: wrong3`.
> Give exactly 3 wrong answers for every question.
> The wrong answers must be plausible and tricky: common misconceptions and
> near-misses, never random words.
> Every wrong answer must have a similar length and style to the correct
> answer.
> Never write "all of the above" or "none of the above".
> No numbering, no header row, no commentary.

Then paste the answer in the app, name the deck and press **IMPORT DECK**.

Example of the expected output:

```
Capital of France :: Paris :: Marseille :: Lyon :: Nice
Capital of Japan :: Tokyo :: Kyoto :: Osaka :: Sapporo
Capital of Italy :: Rome :: Milan :: Venice :: Naples
```

## What the app does with the deck

- The deck appears in the deck picker of the home screen, and it is the deck
  that is selected when the import is done.
- Every card with wrong answers is a normal multiple choice card: the choices
  are the correct answer and the wrong answers written for that question,
  shuffled.
- Every card without wrong answers is a self-graded card: the question is
  shown, the player reveals the answer and grades it.
- Every card starts as a **new** card, due right now, and the scheduler takes
  it from there.
- A deck can be deleted from the picker (the little bin on the card, or a long
  press on it): the deck, its cards and their reviews leave the game.
