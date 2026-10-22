import { describe, expect, it } from 'vitest';

import { ADMIN_TOKEN_GRANT, applyTokenAdminAction } from '../src/admin';
import type { WalletSnapshot } from '../src/wallet';

const WALLET: WalletSnapshot = {
  balance: 250,
  day: '2026-10-22',
  tokensToday: 40,
  packTicketsToday: 1,
  packTickets: 3,
};

describe('applyTokenAdminAction', () => {
  it('resets the balance to zero and keeps the counters', () => {
    expect(applyTokenAdminAction(WALLET, 'reset')).toEqual({
      ...WALLET,
      balance: 0,
    });
  });

  it('adds the admin grant', () => {
    expect(ADMIN_TOKEN_GRANT).toBe(1000);
    expect(applyTokenAdminAction(WALLET, 'grant')).toEqual({
      ...WALLET,
      balance: 250 + ADMIN_TOKEN_GRANT,
    });
  });

  it('adds the amount the caller asks for', () => {
    expect(applyTokenAdminAction(WALLET, 'grant', 25.9).balance).toBe(275);
    expect(applyTokenAdminAction(WALLET, 'grant', -5).balance).toBe(250);
  });

  it('never changes the wallet it is given', () => {
    const wallet = { ...WALLET };
    applyTokenAdminAction(wallet, 'reset');
    applyTokenAdminAction(wallet, 'grant');

    expect(wallet).toEqual(WALLET);
  });
});
