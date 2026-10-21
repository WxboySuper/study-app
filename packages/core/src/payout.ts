/**
 * Everything the server needs to know to pay out a finished session.
 */
export interface PayoutInput {
  /** How many questions were answered correctly. */
  correct: number;
  /** How many new cards were learned (graduated) during the session. */
  graduated: number;
  /** How many due cards were cleared during the session. */
  dueCleared: number;
  /** The score of the (cosmetic) game mode, e.g. the "number goes up" counter. */
  modeScore: number;
  /** How many tokens have already been earned today, before this payout. */
  tokensToday: number;
}

/** The token economy, kept configurable so it can be tuned without a deploy. */
export interface PayoutRules {
  /** Tokens per correct answer. */
  tokensPerCorrect: number;
  /** Tokens per newly learned (graduated) card. */
  tokensPerGraduated: number;
  /** Tokens per due card that was cleared. */
  tokensPerDueCleared: number;
  /** Tokens per point of the game mode score. */
  modeBonusPerPoint: number;
  /** The soft daily cap: tokens beyond this are worth `softCapRatio`. */
  softCap: number;
  /** How much a token is worth once the soft cap is reached. */
  softCapRatio: number;
}

/**
 * Defaults taken from docs/SPEC.md §3:
 * `tokens = 10·correct + 25·newCardsGraduated + 5·dueCleared + modeBonus(score)`
 */
export const DEFAULT_PAYOUT_RULES: PayoutRules = {
  tokensPerCorrect: 10,
  tokensPerGraduated: 25,
  tokensPerDueCleared: 5,
  modeBonusPerPoint: 0.1,
  softCap: 300,
  softCapRatio: 0.25,
};

/** The (server authoritative) result of a session payout. */
export interface Payout {
  /** Tokens earned from the correct answers, graduations and cleared cards. */
  baseTokens: number;
  /** Tokens earned from the game mode score. */
  bonusTokens: number;
  /** `baseTokens + bonusTokens`, before the daily cap. */
  grossTokens: number;
  /** The tokens actually awarded. */
  tokens: number;
  /** `true` when the soft daily cap reduced the payout. */
  capped: boolean;
  /** The soft cap that was applied. */
  softCap: number;
}

/**
 * Computes the token payout of a finished session.
 *
 * The payout is deliberately computed on the server from the review logs, so
 * the client cannot pay itself. The daily cap is *soft*: once the cap is
 * reached every further token is only worth `softCapRatio` of its value, so
 * grinding never beats spacing but is never impossible either.
 */
export function computePayout(input: PayoutInput, rules: Partial<PayoutRules> = {}): Payout {
  const economy: PayoutRules = {
    ...DEFAULT_PAYOUT_RULES,
    ...rules,
  };

  const correct = nonNegative(input.correct);
  const graduated = nonNegative(input.graduated);
  const dueCleared = nonNegative(input.dueCleared);
  const modeScore = nonNegative(input.modeScore);
  const tokensToday = nonNegative(input.tokensToday);

  const baseTokens =
    economy.tokensPerCorrect * correct +
    economy.tokensPerGraduated * graduated +
    economy.tokensPerDueCleared * dueCleared;
  const bonusTokens = Math.floor(modeScore * economy.modeBonusPerPoint);
  const grossTokens = baseTokens + bonusTokens;

  const softCap = Math.max(0, economy.softCap);
  const headroom = Math.max(0, softCap - tokensToday);

  if (grossTokens <= headroom) {
    return {
      baseTokens,
      bonusTokens,
      grossTokens,
      tokens: grossTokens,
      capped: false,
      softCap,
    };
  }

  const overflow = grossTokens - headroom;
  const ratio = Math.max(0, economy.softCapRatio);
  const tokens = headroom + Math.floor(overflow * ratio);

  return {
    baseTokens,
    bonusTokens,
    grossTokens,
    tokens,
    capped: true,
    softCap,
  };
}

function nonNegative(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}
