import { describe, expect, it } from 'vitest';

import {
  createFishingState,
  fishingReducer,
  toSessionResult,
  type FishingEvent,
} from '../../src/fishing/machine';
import { buyPack, findPackDef } from '../../src/packs';
import { createSeededRng } from '../../src/fishing/roll';
import { emptyWallet, settleSession, type Settlement } from '../../src/wallet';
import { makeQueueItem, sequenceRng } from './helpers';

/**
 * A fishing session never grants a critter to the collection.
 *
 * The critters of the collection come from the packs alone. A critter that
 * swims up in the lake is a catch: it counts for the haul, it is shown on the
 * reveal and on the payout screen, and that is all it does.
 */

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const TODAY = '2026-10-21';

/**
 * The critters a settlement grants to the collection.
 *
 * The settlement has no critter channel: the read is dynamic on purpose, so
 * a grant that sneaks back in fails the test below instead of slipping
 * through the types.
 */
function grantedCritters(settlement: Settlement): { critterId: string }[] {
  const grants = (settlement as { critters?: { critterId: string }[] }).critters;
  return grants ?? [];
}

/**
 * Plays a whole fishing session: every card is answered correctly, so every
 * catch lands.
 *
 * The dice is scripted: the tier roll lands on "Easy One", whose pool holds
 * the common critters of the packs that are on sale.
 */
function playSession(catches: number) {
  let state = createFishingState({
    rng: sequenceRng([0.5, 0.0, 0.5]),
    queue: Array.from({ length: catches }, (_, index) => makeQueueItem(`card-${index}`)),
    now: NOW,
  });

  for (let index = 0; index < catches; index += 1) {
    const events: FishingEvent[] = [
      { type: 'cast' },
      { type: 'cast_landed' },
      { type: 'bite' },
      { type: 'reel' },
      { type: 'answer', choiceIndex: 0, durationMs: 500, now: NOW },
      { type: 'answer_hold_done' },
      { type: 'reel_finished' },
      { type: 'continue' },
    ];
    state = events.reduce(fishingReducer, state);
  }

  return state;
}

/**
 * The end of a session, the way the app does it: the wallet is credited and
 * the store writes the critters the settlement grants to the collection.
 */
function endSession(collection: Map<string, number>, result: ReturnType<typeof toSessionResult>) {
  const settlement = settleSession(
    emptyWallet(TODAY),
    {
      correct: result.correct,
      reviews: result.reviews,
      packTickets: result.packTickets,
      heavyCatches: result.heavyCatches,
    },
    TODAY,
  );

  for (const critter of grantedCritters(settlement)) {
    collection.set(critter.critterId, (collection.get(critter.critterId) ?? 0) + 1);
  }

  return settlement;
}

describe('the collection and the fishing mode', () => {
  it('leaves the collection unchanged after a simulated fishing session', () => {
    // The collection of the player, with a critter that the session catches
    // again (a duplicate) and one that it does not catch at all.
    const collection = new Map<string, number>([
      ['nibbles_the_notecard', 2],
      ['gigabrain_golem', 1],
    ]);
    const before = new Map(collection);

    const state = playSession(3);
    const result = toSessionResult(state);

    // The session catches critters: they are catches like any other.
    expect(result.critters).toHaveLength(3);
    expect(result.critters.map((entry) => entry.critterId)).toEqual([
      'nibbles_the_notecard',
      'nibbles_the_notecard',
      'nibbles_the_notecard',
    ]);
    expect(result.haulLbs).toBeGreaterThan(0);
    expect(result.catches).toBe(3);

    // The session end pays the wallet...
    const settlement = endSession(collection, result);
    expect(settlement.payout.tokens).toBeGreaterThan(0);
    expect(settlement.wallet.balance).toBe(settlement.payout.tokens);

    // ... and the collection is exactly what it was before the session.
    expect(collection).toEqual(before);
    expect(collection.get('nibbles_the_notecard')).toBe(2);
    expect(collection.has('gigabrain_golem')).toBe(true);
  });

  it('never grants a critter, not even one that was never owned', () => {
    const collection = new Map<string, number>();
    const before = new Map(collection);

    const result = toSessionResult(playSession(1));
    endSession(collection, result);

    expect(collection).toEqual(before);
    expect(collection.size).toBe(0);
  });

  it('keeps the critters of the session in the result of the session', () => {
    // The critters are part of the haul and of the payout screen: they are
    // reported, they are never granted.
    const result = toSessionResult(playSession(1));

    expect(result.critters).toHaveLength(1);
    expect(result.critters[0]?.name).toBe('Nibbles the Notecard');
    expect(result.critters[0]?.rarity).toBe('common');
    expect(result.critters[0]?.tier).toBe('easy');
    expect(result.critters[0]?.lbs).toBeGreaterThan(0);
  });

  it('leaves the collection to the packs', () => {
    // Only a pack grants a critter: it is the one that hands out a critter id
    // the store can add to the collection.
    const pack = findPackDef('brain_buddies');
    expect(pack).toBeDefined();

    const purchase = buyPack(
      { balance: 1_000, day: TODAY, tokensToday: 0, packTicketsToday: 0, packTickets: 0 },
      pack!,
      NOW,
      { rng: createSeededRng(7) },
    );

    expect(purchase.ok).toBe(true);
    if (purchase.ok) {
      expect(purchase.critterId).not.toBe('');
    }
  });
});
