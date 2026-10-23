# Deck format

The app can import a deck that is **pasted as text** or **opened as a file**.
This page is the spec: follow it and the deck lands in the game as a normal
deck of cards.

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

## Math and long answers

Math is written in **LaTeX**, right inside the text of a question or of an
answer. Nothing else changes: the math is simply part of the line.

| Syntax | What it does | Example |
| ------ | ------------ | ------- |
| `$...$` | math **inside** a line (inline) | `What is $\frac{dT}{dt}$?` |
| `$$...$$` | math **on its own line** (block) | `$$E = mc^2$$` |

- A **literal dollar sign** (a price) is escaped: write `\$5`, it is shown as
  `$5`.
- A `$` that is **never closed** is shown as a plain dollar sign, so an
  unbalanced `$` never breaks a card.
- The math is rendered **offline**: KaTeX is bundled in the app, so it works
  on Android, on iOS and on the web, with no connection needed.
- The **wrong answers may carry math too**, and they should stay close in
  length to the correct answer.
- The pipe `|` is a **separator** of the line format: never write a raw `|`
  inside a math expression. Write `\mid` instead, or use the `::` or the TAB
  format.

**Long answers are allowed**: the buttons of the game grow to fit the answer,
so an answer is never cut off. Keep them reasonably concise though (a
sentence or two): a very long answer slows the game down and is hard to read
on a phone.

An example (meteorology):

```
How does the temperature of a fluid change over time? :: $\frac{dT}{dt} = \frac{\partial T}{\partial t} + \vec{V}\cdot\nabla T$ :: $\frac{dT}{dt} = \frac{\partial T}{\partial t}$ :: $\frac{dT}{dt} = \vec{V}\cdot\nabla T$ :: $\frac{dT}{dt} = \frac{\partial T}{\partial t} + \vec{V}\cdot\nabla^2 T$
```

## Math questions (typed answers)

A ready-to-import sampler (derivatives, integrals, setups and multi-step
questions) lives in [`docs/samples/calculus.json`](samples/calculus.json).

A **math question** is answered by typing on the math keyboard of the game,
not by picking a choice. It only exists in the JSON format: add
`"type": "math"` to a question.

```json
{ "name": "Calculus", "questions": [
  { "id": "d-power", "type": "math", "question": "$\\frac{d}{dx}\\left(x^3\\right)$", "answer": "3x^2" },
  { "id": "i-2x", "type": "math", "question": "$\\int 2x\\,dx$", "answer": "x^2 + C" },
  { "id": "s-area", "type": "math", "setup": true,
    "question": "Set up the area under $y = x^2$ from $x=0$ to $x=2$.",
    "answer": "int(x^2, x, 0, 2)" },
  { "id": "m-between", "type": "math",
    "question": "Area between $y = 2x$ and $y = x^2$.",
    "answer": "4/3",
    "steps": [
      { "prompt": "Where do the curves meet? (the right one)", "answer": "2" },
      { "prompt": "Set up the area", "setup": true, "answer": "int(2x - x^2, x, 0, 2)" },
      { "prompt": "An antiderivative of $2x - x^2$", "answer": "x^2 - x^3/3 + C" }
    ] }
] }
```

| Field | What it is |
| ----- | ---------- |
| `type` | `"math"` (required). |
| `question` | The prompt, with KaTeX between `$...$` as everywhere else. |
| `answer` or `answers` | The accepted answer, or a list of them (max 8). The first one is the one shown after a miss. Numbers are fine (`"answer": 4`). |
| `setup` | `true` for a **setup-only** question: the answer is the setup itself (`int(x^2, x, 0, 2)`), not its value. |
| `steps` | Optional, max 8. Each step is `{ "prompt", "answer"/"answers", "setup"? }`. The steps are asked in order, then the final answer. |
| `constant` | Optional: `true` makes the answer `+ C` tolerant. It is on by itself when an answer ends in `+ C`. |

**How answers are graded.** Any **equivalent** answer is right: `3x^2`,
`3*x^2` and `x^2*3` are the same answer. The grader simplifies both sides
and, when that is not enough, compares them at random points. An
antiderivative (`+ C`) is right with or without `+ C`, and with any other
constant. A **setup** answer is compared by its structure: the integral (or
the derivative), the variable, the bounds and an equivalent integrand
(`int(x*x, x, 0, 2)` is right for `int(x^2, x, 0, 2)`; `int(x^2, x, 0, 3)` is
not). A question with steps is right only when every step and the final
answer are right; the speed is the time of the whole question.

**The answer syntax** (what the keyboard types, and what `answer` holds):

| Write | For |
| ----- | --- |
| `3x^2`, `3*x^2`, `x^(1/2)` | products (the `*` is optional) and powers |
| `(x+1)/(x-1)` | fractions |
| `sqrt(x)`, `abs(x)` | roots, absolute values |
| `pi`, `e` | the constants |
| `sin(x)` `cos` `tan` `sec` `csc` `cot` `asin` `acos` `atan` | trig |
| `ln(x)`, `log(x)` (base 10), `log(x, 2)`, `exp(x)` | logs |
| `int(f, x)` | the indefinite integral of `f` in `x` |
| `int(f, x, a, b)` | the definite integral of `f` from `a` to `b` |
| `diff(f, x)` | the derivative of `f` in `x` |
| `pdiff(f, x)` | the partial derivative of `f` in `x` |
| `+ C` | the constant of an antiderivative (optional) |

The variables are `x`, `y` and `t` (any other single letter works too).
A math question keeps its id and its progress like any other question.
Older versions of the app show a math question as a self-graded one.

## The import preview

Importing a deck is one tap:

1. **PASTE FROM CLIPBOARD** reads the clipboard, parses it and shows the
   preview sheet.
2. **OPEN FILE** does the same with a deck file (a JSON or a plain text one).
3. The preview sheet shows what was found, and **IMPORT** puts the cards in
   the game. **CANCEL** throws the deck away.

The preview sheet shows:

```
N questions · M multiple choice · K self-graded · J math
```

- The **name of the deck**: the name of the JSON deck, else the name of the
  file without its extension, else "Imported deck". The sheet carries a
  small **rename** field, so the player can change it.
- When `K > 0` a **yellow warning chip** is shown: those cards will be
  self-graded, not multiple choice.
- The **first 3 questions** are shown with their choices, so a bad paste is
  visible before the import.
- The lines that could not be read are listed with their line number.

An empty clipboard and a deck that cannot be read never break the screen:
they show a friendly message instead.

The **Paste manually** box is the last fallback: it is closed by default,
and it is only there for the decks that cannot be copied.

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
> Write the math in LaTeX: `$...$` for math inside a line, `$$...$$` for math
> on its own line. Escape a literal dollar sign as `\$`.
> Long answers are allowed, but keep them concise: a sentence or two.
> No numbering, no header row, no commentary.

Then copy the answer and press **PASTE FROM CLIPBOARD** in the app, check the
preview and press **IMPORT**.

Example of the expected output:

```
Capital of France :: Paris :: Marseille :: Lyon :: Nice
Newton's second law :: $F = ma$ :: $F = mv$ :: $E = mc^2$ :: $p = mv$
Heat equation :: $\frac{\partial T}{\partial t} = \alpha \nabla^2 T$ :: $\frac{\partial T}{\partial t} = \alpha \nabla T$ :: $\frac{\partial T}{\partial t} = \alpha T$ :: $\frac{\partial T}{\partial t} = \alpha \nabla^2 P$
```

## For Muse: updating a deck

A question in the JSON format may carry an optional `id` (letters, digits, `_ . : -`, up to 128 characters, unique in the deck):

```json
{ "id": "deck_123", "name": "European capitals", "questions": [
  { "id": "q_paris", "question": "Capital of France", "correct": "Paris", "wrong": ["Lyon"] }
] }
```

- Get the ids with `GET /api/decks/:id`. Send them back when you update a deck, so a reworded question keeps its progress.
- Without an `id`, a question is matched by its text (case and spacing ignored). A question with the same text keeps its id and progress even when its answers change.
- A question that is no longer in the deck is **retired**: it leaves play, but its progress and quiz history stay, and sending it again brings it back.
- See docs/API.md, "Decks (Muse)", for editing one question at a time.
- Math questions (`"type": "math"`) follow the same rules: see "Math questions (typed answers)" above.

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
