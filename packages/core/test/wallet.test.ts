import { State } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';

import {
  NOOP_WALLET_SYNC,
  countStudyProgress,
  emptyWallet,
  localDayKey,
  rollWalletDay,
  settleSession,
  type SessionReviewLike,
} from '../src/wallet';

function review(cardId: string, before: State, after: State): SessionReviewLike {
  return { cardId, log: { state: before }, state: { state: after } };
}

const TODAY = '2026-10-21';

describe('countStudyProgress', () => {
  it('counts graduations once per card', () => {
    expect(
      countStudyProgress([
        review('a', State.New, State.Learning),
        review('a', State.Learning, State.Review),
        review('b', State.New, State.Review),
        review('b', State.Relearning, State.Review),
        review('c', State.New, State.Learning),
      ]),
    ).toEqual({ graduated: 2, dueCleared: 0 });
  });

  it('counts due cards that stay in review', () => {
    expect(
      countStudyProgress([
        review('d', State.Review, State.Review),
        review('e', State.Review, State.Relearning),
        review('f', State.Review, State.Relearning),
        review('f', State.Relearning, State.Review),
        review('d', State.Review, State.Review),
      ]),
    ).toEqual({ graduated: 0, dueCleared: 2 });
  });

  it('is zero for an empty session', () => {
    expect(countStudyProgress([])).toEqual({ graduated: 0, dueCleared: 0 });
  });
});

describe('wallet day', () => {
  it('formats the local day', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('resets the daily counters on a new day only', () => {
    const wallet = { balance: 40, day: '2026-10-20', tokensToday: 40, packTicketsToday: 1, packTickets: 1 };
    expect(rollWalletDay(wallet, '2026-10-20')).toBe(wallet);
    expect(rollWalletDay(wallet, TODAY)).toEqual({
      balance: 40,
      day: TODAY,
      tokensToday: 0,
      packTicketsToday: 0,
      packTickets: 1,
    });
  });
});

describe('settleSession', () => {
  it('pays the real formula and credits the wallet', () => {
    const reviews = [
      review('n1', State.New, State.Review),
      review('d1', State.Review, State.Review),
      review('d2', State.Review, State.Review),
      review('d3', State.Review, State.Review),
      review('d4', State.Review, State.Review),
    ];
    const result = settleSession(
      emptyWallet(TODAY),
      { correct: 30, reviews, packTickets: 0 },
      TODAY,
    );
    // 30 * 1.5 + 1 * 1 + 4 * 0.25 = 47
    expect(result.progress).toEqual({ graduated: 1, dueCleared: 4 });
    expect(result.payout.tokens).toBe(47);
    expect(result.wallet).toMatchObject({ balance: 47, tokensToday: 47 });
  });

  it('pays the heavy catch bonus', () => {
    const plain = settleSession(
      emptyWallet(TODAY),
      { correct: 10, reviews: [], packTickets: 0 },
      TODAY,
    );
    const heavy = settleSession(
      emptyWallet(TODAY),
      { correct: 10, reviews: [], packTickets: 0, heavyCatches: 2 },
      TODAY,
    );

    expect(heavy.payout.heavyTokens).toBe(30);
    expect(heavy.payout.tokens).toBe(plain.payout.tokens + 30);
    expect(heavy.wallet.balance).toBe(plain.wallet.balance + 30);
  });

  it('applies the soft daily cap', () => {    const wallet = { ...emptyWallet(TODAY), balance: 10, tokensToday: 490 };
    const result = settleSession(wallet, { correct: 20, reviews: [], packTickets: 0 }, TODAY);
    // 30 gross, 10 headroom, 20 overflow at 0.25 = 5
    expect(result.payout.tokens).toBe(15);
    expect(result.payout.capped).toBe(true);
    expect(result.wallet.balance).toBe(25);
  });

  it('forgets yesterday when settling today', () => {
    const wallet = { balance: 5, day: '2026-10-20', tokensToday: 500, packTicketsToday: 1, packTickets: 0 };
    const result = settleSession(wallet, { correct: 2, reviews: [], packTickets: 1 }, TODAY);
    expect(result.payout.capped).toBe(false);
    expect(result.packTicketsAwarded).toBe(1);
    expect(result.wallet).toEqual({ balance: 8, day: TODAY, tokensToday: 3, packTicketsToday: 1, packTickets: 1 });
  });

  it('caps pack tickets per session and per day', () => {
    const first = settleSession(emptyWallet(TODAY), { correct: 0, reviews: [], packTickets: 3 }, TODAY);
    expect(first.packTicketsAwarded).toBe(1);
    const second = settleSession(first.wallet, { correct: 0, reviews: [], packTickets: 1 }, TODAY);
    expect(second.packTicketsAwarded).toBe(0);
    expect(second.wallet.packTickets).toBe(1);
    const odd = settleSession(emptyWallet(TODAY), { correct: 0, reviews: [], packTickets: -2 }, TODAY);
    expect(odd.packTicketsAwarded).toBe(0);
  });

  it('never grants a critter to the collection', () => {
    // A session pays the wallet, nothing else: the settlement carries no
    // critter, so there is no way for a session to fill the collection.
    const result = settleSession(
      emptyWallet(TODAY),
      { correct: 0, modeScore: 0, reviews: [], packTickets: 0 },
      TODAY,
    );

    expect(Object.keys(result)).not.toContain('critters');
    expect(result.wallet.balance).toBe(0);
  });

  it('has a no-op sync seam', async () => {
    const result = settleSession(emptyWallet(TODAY), { correct: 0, reviews: [], packTickets: 0 }, TODAY);
    await expect(NOOP_WALLET_SYNC.pushSettlement('s', result)).resolves.toBeUndefined();
  });
});
