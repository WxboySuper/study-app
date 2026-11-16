# Critter card format

The album shows every critter as a **study card**. The card keeps the glass
look of the app and adds the structure of a collectible: a number, a rarity
and a window with the art.

```
┌───────────────────────┐
│ No. 07        ◆◆◆◇◇   │  catalogue number (position in the pack), rarity pips
│ ┌───────────────────┐ │
│ │  graph paper,     │ │  CritterFrame: graph paper tinted with the rarity
│ │  rarity tint      │ │  gradient; the critter art sits inside, ×N chip
│ │      (art)    ×2  │ │  bottom right
│ └───────────────────┘ │
│ Recall Raccoon        │  name (Fredoka)
│ Uncommon              │  rarity label in the rarity color
└───────────────────────┘
```

- Two cards per row on a phone (about 48% wide each).
- Rarity pips: common 1, uncommon 2, rare 3, epic 4, legendary 5
  (`RarityPips`, `RARITY_LEVEL`).
- A missing critter keeps its number, shows a dark window with `?` and the
  label `???` / `Not found yet`.
- The sheet of a critter reuses `CritterFrame` and `RarityPips`, with the flavor
  line (`vibe`) under the name.
- Epic and legendary critters keep the slow shine.

Code: `apps/mobile/src/collection/` (`CritterCard`, `CritterFrame`,
`RarityPips`, `CritterSheet`).

## Art spec for new critters

The window is square and the art is drawn at 88% of it, so new art must:

1. Be a **1024×1024 PNG with a transparent background**, one critter, centered,
   filling about 80% of the canvas with even margins (no cropped limbs, no
   ground shadow baked in).
2. Read well on a dark, graph-paper window at 150 px: strong silhouette, one
   clear focal feature, no fine detail that disappears when small.
3. Use one consistent style across the whole roster: a confident outline in a
   darker shade of the body color (not pure black), flat color with one soft
   shadow tone and one highlight, three to four hues per critter.
4. Carry a **study motif** in the character design (a pencil, a card, a lamp,
   a book) and a personality that is expressive but not babyish: knowing,
   curious or smug rather than wide-eyed.
5. No text, no frame, no background.

Files go in `apps/mobile/assets/critters/<assetId>.png`, where `assetId` is the
`assetId` of the critter in `packages/core/src/content/critters.ts`.
