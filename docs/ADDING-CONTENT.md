# Adding content to the game

Everything the player can collect or catch is **data**. Adding a critter, a
pack, a junk item, a special or (later) a fish is one entry in a registry
plus one image. No logic changes, no new screens.

This guide is the short version. The registries live in
`packages/core/src/content/`, the art resolver in
`apps/mobile/src/content/art.ts`.

## The shape of an entry

Every entry has:

| Field | Meaning |
|---|---|
| `id` | The stable id of the entry (`snake_case`). It is used in the save data and in the session log. |
| `name` | The name shown to the player. |
| `tier` / `rarity` | Where the entry shows up: the tier of the fishing ladder (`trash`, `easy`, `great`, `rare`, `epic`, `cotd`, `legend`) or the rarity of a critter (`common`, `uncommon`, `rare`, `epic`, `legendary`). |
| `assetId` | The **art key** of the entry: the file name of its PNG, without the extension (`critter_gigabrain_golem`). The art resolver maps it to the image. |
| `emoji` | The emoji shown when the image does not exist (yet). |
| `availableFrom` / `availableUntil` | Optional. The window the entry is available in, in epoch milliseconds. `null` (or missing) means "always". The window is `[from, until)`. |
| `seasonal` | Optional (`halloween`, `winter`). The entry only shows up in that season. |

The `assetId` of a critter is prefixed with `critter_`, the one of a junk
item with `junk_`, the one of a special with `special_` or `pu_` and the one
of a fish with `fish_`. The prefix tells the app what the entry is (and which
placeholder to use when the image is missing).

## The registries

| File | What it holds |
|---|---|
| `packages/core/src/content/critters.ts` | The critters (`CRITTERS`), their rarities and the odds of the packs. |
| `packages/core/src/content/packs.ts` | The packs (`CRITTER_PACKS`) with their price and their window. |
| `packages/core/src/content/junk.ts` | The junk of the "Trash" tier (`JUNK`). |
| `packages/core/src/content/specials.ts` | The specials of the "Special" slice (`SPECIALS`) and the powerups (`POWERUPS`). |
| `packages/core/src/content/fish.ts` | The fish of the future (`FISHES`). Typed and **empty**: the mode catches critters, junk and specials. |

The logic files only read these registries: `src/critters.ts` (the lookups),
`src/packs.ts` (the shop), `src/collection.ts` (the collection and the
selling) and `src/fishing/` (the mode).

## The art

The images live in `apps/mobile/assets/`:

| Folder | What goes there |
|---|---|
| `assets/critters/` | The critters (`<assetId>.png`). |
| `assets/fishing/` | The scene, the junk, the lures, the specials and the UI (`<assetId>.png`). |
| `assets/content/` | The placeholders (one per type). They are generated, do not draw them by hand. |

The naming rule is simple: **the file name is the art key of the entry**.

### The art resolver

`apps/mobile/src/content/art.ts` is the only place that knows about the
images:

```ts
const art = resolveArt('critter_gigabrain_golem');
art.source; // the PNG of the critter (or the placeholder)
art.placeholder; // true when the PNG does not exist
art.type; // 'critter'
```

- `artFor(assetId)` returns the PNG of an art key, or `null`.
- `resolveArt(assetId)` returns the PNG, or the **placeholder of the type**
  of the entry when the PNG is missing. The game therefore never shows an
  empty hole.
- `placeholderFor(type)` returns the placeholder image (`critter`, `junk`,
  `special` or `fish`).

The map of the images is generated (Metro can only bundle a file that
exists), so after you add a PNG:

```bash
cd apps/mobile && node scripts/generate-fishing-assets.mjs
```

The placeholders are generated too:

```bash
cd apps/mobile && node scripts/generate-placeholder-art.mjs
```

## Adding a critter

1. Draw the image: `apps/mobile/assets/critters/critter_<id>.png` (512×512,
   transparent, the style of `docs/ART-HANDOFF.md`).
2. Add the entry to `packages/core/src/content/critters.ts`:

```ts
{
  id: 'sleepy_seminar',
  name: 'Sleepy Seminar',
  packId: 'brain_buddies',
  rarity: 'common',
  vibe: 'Nods off, but somehow still passes.',
  assetId: 'critter_sleepy_seminar',
  emoji: '🥱',
},
```

3. Run the art script (step 1 of "The art resolver").
4. `pnpm test` — the catalogue tests check the ids, the rarities and the art
   keys.

The critter is now in the packs, in the collection book and in the fishing
mode: it swims up as an "Easy One" while its pack is on sale.

## Adding a pack

1. Add the pack to `packages/core/src/content/packs.ts`:

```ts
{
  id: 'winter_wonderland',
  name: 'Winter Wonderland',
  kind: 'seasonal',
  priceTokens: 25,
  // Dec 1 2026 00:00 UTC -> Jan 5 2027 00:00 UTC.
  availableFrom: Date.UTC(2026, 11, 1),
  availableUntil: Date.UTC(2027, 0, 5),
  assetId: 'pack_winter_wonderland',
  emoji: '❄️',
},
```

2. Add the critters of the pack to `packages/core/src/content/critters.ts`
   with `packId: 'winter_wonderland'`.
3. Draw the art of the pack and of its critters.

A pack with a window is only on sale inside it: it cannot be bought, its
critters do not swim up in the fishing mode and it is not rolled by the
special table. A pack without a window (`availableFrom: null` and
`availableUntil: null`) is always on sale.

## Adding a junk item

1. Draw the image: `apps/mobile/assets/fishing/junk_<id>.png`.
2. Add the entry to `packages/core/src/content/junk.ts`:

```ts
{
  id: 'waterlogged_notes',
  name: 'Waterlogged Notes',
  tier: 'trash',
  minLbs: 1,
  maxLbs: 10,
  assetId: 'junk_waterlogged_notes',
  emoji: '📒',
  joke: 'The ink is a rumour now.',
},
```

3. Run the art script.

## Adding a special

1. Draw the image: `apps/mobile/assets/fishing/special_<id>.png` (or
   `pu_<id>.png` for a powerup).
2. Add the entry to `packages/core/src/content/specials.ts`:

```ts
{
  id: 'double_points',
  name: 'Double Points!',
  kind: 'pack_ticket',
  assetId: 'special_double_points',
  emoji: '✨',
  description: 'The next correct answer pays double.',
},
```

A powerup goes into the `POWERUPS` list of the same file (with its own
`id`, `description` and `assetId`).

A **new kind** of special (one the mode does not know yet) needs a little
logic: the outcome of the roll, the state of the session and the reveal card
have to handle it. Everything else is data.

## Adding a fish (the future registry)

The fish registry is typed and empty, because the mode catches critters. To
bring the fish back:

1. Draw the image: `apps/mobile/assets/fishing/fish_<id>.png`.
2. Add the entry to `packages/core/src/content/fish.ts`:

```ts
{
  id: 'minnow_memo',
  name: 'Minnow Memo',
  tier: 'easy',
  minLbs: 10,
  maxLbs: 25,
  assetId: 'fish_minnow_memo',
  emoji: '🐟',
},
```

3. The pool of a tier is built from the registries, so the fish shows up as
   soon as it is listed. The catch table (`src/fishing/catches.ts`) may need
   one line to add the fish to the catalogue, the way the critters and the
   junk are added.

## The rules that must hold

- A **sell value is always below the cheapest pack** (20 tokens): Common 1,
  Uncommon 2, Rare 4, Epic 8, Legendary 15. There is a test for it
  (`packages/core/test/collection.test.ts`).
- The **ids and the art keys are unique** (there is a test for it in
  `packages/core/test/content.test.ts`).
- A critter always belongs to a **pack of the catalogue** and has a rarity of
  the catalogue.
- The **odds** of the packs are the ones of the SPEC: Common 60 % · Uncommon
  25 % · Rare 10 % · Epic 4 % · Legendary 1 %.

## Checklist

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```
