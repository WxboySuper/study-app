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
  /** How many heavy catches landed (each of them pays a bonus). */
  heavyCatches?: number;
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
  /** Tokens per heavy catch of the fishing mode (a multiple of 5). */
  tokensPerHeavyCatch: number;
  /** The soft daily cap: tokens beyond this are worth `softCapRatio`. */
  softCap: number;
  /** How much a token is worth once the soft cap is reached. */
  softCapRatio: number;
}

/**
 * Defaults from docs/SPEC.md "Economy tuning": ~1.5 tokens per correct answer,
 * so a ~10 min session (~30 correct) earns ~50 tokens and buys ~2 packs (20-25).
 * The soft daily cap (~500) sits well above a normal day's play.
 */
export const DEFAULT_PAYOUT_RULES: PayoutRules = {
  tokensPerCorrect: 1.5,
  tokensPerGraduated: 1,
  tokensPerDueCleared: 0.25,
  modeBonusPerPoint: 0.01,
  tokensPerHeavyCatch: 15,
  softCap: 500,
  softCapRatio: 0.25,
};

/** The (server authoritative) result of a session payout. */
export interface Payout {
  /** Tokens earned from the correct answers, graduations and cleared cards. */
  baseTokens: number;
  /** Tokens earned from the game mode score. */
  bonusTokens: number;
  /** Tokens earned from the heavy catches of the session. */
  heavyTokens: number;
  /** `baseTokens + bonusTokens + heavyTokens`, before the daily cap. */
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
 *
 * A heavy catch of the fishing mode pays a flat bonus of
 * `tokensPerHeavyCatch` tokens (15, a multiple of 5). Every other rule is
 * the one of the SPEC.
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
  const heavyCatches = nonNegative(input.heavyCatches ?? 0);
  const tokensToday = nonNegative(input.tokensToday);

  const baseTokens = Math.floor(
    economy.tokensPerCorrect * correct +
    economy.tokensPerGraduated * graduated +
    economy.tokensPerDueCleared * dueCleared,
  );
  const bonusTokens = Math.floor(modeScore * economy.modeBonusPerPoint);
  const heavyTokens = Math.floor(heavyCatches * economy.tokensPerHeavyCatch);
  const grossTokens = baseTokens + bonusTokens + heavyTokens;

  const softCap = Math.max(0, economy.softCap);
  const headroom = Math.max(0, softCap - tokensToday);

  if (grossTokens <= headroom) {
    return {
      baseTokens,
      bonusTokens,
      heavyTokens,
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
    heavyTokens,
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
