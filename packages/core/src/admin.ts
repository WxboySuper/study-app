import type { WalletSnapshot } from './wallet';

/**
 * The hidden admin panel of the game.
 *
 * The panel is for the developer of the app: it clears the collection,
 * resets the tokens and the daily wheel. The rules are pure so the tests can
 * check them without SQLite.
 */

/** The tokens the "Add 1000 tokens" action grants. */
export const ADMIN_TOKEN_GRANT = 1000;

/** What the token actions of the panel do. */
export type TokenAdminAction = 'reset' | 'grant';

/**
 * Applies a token action to the wallet.
 *
 * Resetting sets the balance to zero (the daily counters are kept). Granting
 * adds {@link ADMIN_TOKEN_GRANT} tokens, which is a gift of the developer:
 * it never counts toward the daily cap of the study sessions.
 */
export function applyTokenAdminAction(
  wallet: WalletSnapshot,
  action: TokenAdminAction,
  amount: number = ADMIN_TOKEN_GRANT,
): WalletSnapshot {
  if (action === 'reset') {
    return { ...wallet, balance: 0 };
  }

  return { ...wallet, balance: wallet.balance + Math.max(0, Math.floor(amount)) };
}
