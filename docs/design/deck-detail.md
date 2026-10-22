# Deck detail screen

Route: `/deck?id=<setId>&filter=<all|due|queued|new|learning|scheduled|mastered>`.

You get there from a deck tile on Home:
- Tap **"N questions ›"** to open the screen unfiltered.
- Tap **"N DUE ›"** to open it already filtered to Due.

## What every row shows
- The prompt and the answer, both rendered with `MathText` (so KaTeX works).
- A review status from `questionStatus` (packages/core/src/deckDetail.ts):
  - **NEW**: no FSRS state yet, or the card is still in the New state.
  - **DUE**: the due time has passed. This is the same rule as `countScope`, so the badge count and the Due filter always agree.
  - **LEARNING · 10m**: in learning or relearning, and not due yet.
  - **DUE IN 3d**: in review, and not due yet.
- A **QUEUED** pill when the next session of the deck would ask the question. That means the card is in `buildQueue` for the set with a new-card cap of 20, the same cap Home uses.
- Mastery dots **n/3**, read from the saved Mastery-mode counts (`fishing.masteryCounts.v1`). A row turns gold with ★ once it reaches 3/3.

## Filters
The counters at the top double as filters: All, Due, Queued, New, Learning, Later and Mastered. Tapping the active counter again goes back to All.

The bottom bar has a button that plays the deck (in Mastery mode if it is switched on). It reads **PLAY N QUEUED** when questions are queued.
