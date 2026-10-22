/**
 * The fishing state machine (docs/design/fishing.md §3).
 *
 * The machine is a pure reducer: the same state and event always produce the
 * same next state, and every random decision goes through the injected RNG.
 * That makes the whole mode testable without a renderer.
 *
 * ```
 * IDLE ─cast─▶ CASTING ─cast_landed─▶ WAITING ─bite─▶ HOOKED
 * HOOKED ─reel─▶ QUESTION ─answer (right)─▶ ANSWERED ─tap─▶ REELING
 * REELING ─reel_finished─▶ REVEAL ─claim (continue)─▶ IDLE
 * QUESTION ─answer (wrong)─▶ ANSWERED (3s lockout) ─tap─▶ GOT_AWAY
 * GOT_AWAY ─continue─▶ IDLE
 * any ─request_end─▶ END_CONFIRM ─confirm_end─▶ (payout)
 * ```
 *
 * The `ANSWERED` phase waits for a tap. A correct answer turns the picked
 * tile green with a ✓, the other tiles grey with a ✗ and the catch comes out
 * of the water after the tap. A wrong answer turns the right answer green and
 * locks the note for {@link WRONG_LOCKOUT_MS}: after the lockout a tap shows
 * the "Fish Lost!" bubble, then the player is back on the dock.
 *
 * The haul is committed when the catch is claimed (a tap on the reveal card),
 * so the counter ticks up at the moment of the claim, not before.
 */

import { Rating, State, type Grade } from 'ts-fsrs';

import type { QueueItem, QueueItemKind } from '../queue';
import { autoRating } from '../rating';
import { grade } from '../scheduler';
import type { CardState, ReviewLogRecord } from '../types';
import type { CritterRarity } from '../critters';
import { CATCH_TIER_ORDER, type CatchTier, type FishingSeason } from './catches';
import { EMPTY_BAITS, type EquippedBaits } from './lures';
import {
  createRollState,
  isCatchOutcome,
  rollCatch,
  type CatchOutcome,
  type Rng,
  type RollState,
  type RolledCatch,
} from './roll';

/** The states of the fishing mode. */
export type FishingPhase =
  | 'idle'
  | 'casting'
  | 'waiting'
  | 'hooked'
  | 'question'
  | 'answered'
  | 'reeling'
  | 'reveal'
  | 'got_away'
  | 'end_confirm';

/**
 * How long the wrong answer stays locked before the player may tap on.
 *
 * The right answer turns green, the picked one turns red and the note counts
 * the lockout down ("Wait 3 seconds"). A tap before the lockout is over is
 * ignored.
 */
export const WRONG_LOCKOUT_MS = 3_000;

/** How long the "Fish Lost!" bubble stays on the screen after the lockout. */
export const FISH_LOST_MS = 900;

/** How long the lead-up before the reveal card lasts for a big catch. */
export const LEAD_UP_FULL_MS = 2_500;

/** How long the lead-up lasts for a junk catch (and for a wrong answer). */
export const LEAD_UP_SHORT_MS = 1_000;

/** The question that is shown in the scene. */
export interface FishingQuestion {
  cardId: string;
  /** The prompt, the front of the card. */
  prompt: string;
  /** The answers. */
  choices: readonly string[];
  /** The index of the correct answer. */
  answerIndex: number;
  /**
   * `true` when the card has no wrong answers of its own.
   *
   * Such a card is not asked as a multiple choice question: the player
   * reveals the answer and grades itself ("Got it" / "Missed it").
   */
  selfGrade: boolean;
  /** The correct answer of the card (the self-graded cards show it). */
  answer: string;
  /** `true` for bonus review cards. */
  bonus: boolean;
  /** Why the card is in the queue. */
  kind: QueueItemKind;
}

/** A catch that landed on the dock. */
export interface CaughtCatch {
  id: string;
  name: string;
  tier: CatchTier;
  lbs: number;
  kind: 'fish' | 'critter' | 'junk' | 'heavy';
  emoji: string;
  assetId: string;
  joke?: string;
  critterId?: string;
}

/**
 * A critter that was caught.
 *
 * A critter catch is a catch like any other: it counts for the haul and it is
 * shown on the reveal and on the payout screen. It never grants the critter
 * to the collection: only a pack does.
 */
export interface CritterCatchRecord {
  critterId: string;
  name: string;
  rarity: CritterRarity;
  tier: CatchTier;
  lbs: number;
  emoji: string;
  assetId: string;
}

/** A review that has to be synced to the server. */
export interface FishingReview {
  cardId: string;
  rating: Grade;
  durationMs: number;
  /** Epoch milliseconds. */
  reviewedAt: number;
  /** The scheduling state after the review. */
  state: CardState;
  /** The review log, flattened for storage. */
  log: ReviewLogRecord;
}

/** The data of the running session. */
export interface FishingSession {
  /** The random source of the session. */
  rng: Rng;
  /** The cards that are still to be asked. */
  queue: readonly QueueItem[];
  /** How many cards of the queue were already used. */
  queueIndex: number;
  /** The scheduling states of the cards, updated while the session runs. */
  cardStates: Map<string, CardState>;
  /** The dice: lure rank, frenzy, powerup, tickets... */
  roll: RollState;
  /** The score of the mode: the total weight in lbs. */
  haulLbs: number;
  /** How many catches landed. */
  catches: number;
  /** How many answers were correct. */
  correct: number;
  /** How many answers were given. */
  answered: number;
  /** The current streak of correct answers. */
  streak: number;
  /** The best streak of the session. */
  bestStreak: number;
  /** How many catches landed per tier. */
  byTier: Record<CatchTier, number>;
  /** The catches in the order they landed. */
  log: CaughtCatch[];
  /**
   * The critters that were caught.
   *
   * They are part of the haul and of the payout screen only: a catch never
   * grants a critter to the collection.
   */
  critters: CritterCatchRecord[];
  /** How many pack tickets the session produced. */
  packTickets: number;
  /** The biggest catch of the session. */
  biggest: CaughtCatch | null;
  /** The reviews of the session. */
  reviews: FishingReview[];
  /** The season, for the seasonal catches. */
  season: FishingSeason | null;
  /** The pack the critter catch is drawn from. */
  critterPackId: string;
  /**
   * The time the session started (epoch milliseconds).
   *
   * It decides which packs are on sale during the session, so a critter of
   * a seasonal pack only swims up while its pack is available.
   */
  now: number;
}

/** The feedback of the last answer. */
export interface FishingFeedback {
  /** `true` when the answer was correct. */
  correct: boolean;
  /** The index of the correct answer, so the scene can highlight it. */
  answerIndex: number;
  /** The index the player picked. */
  choiceIndex: number;
  /** `true` when the player may retry the same card (Second Chance). */
  retry: boolean;
}

/** The state of the fishing mode. */
export interface FishingState {
  /** Where the mode is right now. */
  phase: FishingPhase;
  /** The phase the mode returns to when the end sheet is cancelled. */
  resumePhase: FishingPhase;
  /** The data of the session. */
  session: FishingSession;
  /** The queue item that is currently in play. */
  currentItem: QueueItem | null;
  /** The question that is shown in the scene. */
  question: FishingQuestion | null;
  /** The catch that is on the line (rolled when the fish is hooked). */
  onTheLine: RolledCatch | null;
  /** The catches that land with the reveal. */
  landing: RolledCatch[];
  /** The catch the reveal card shows (the biggest one of the landing). */
  reveal: RolledCatch | null;
  /** The feedback of the last answer. */
  feedback: FishingFeedback | null;
  /**
   * When the wrong-answer lockout ends (epoch milliseconds), or `null` when
   * there is no lockout.
   */
  lockoutUntil: number | null;
  /** `true` once the player confirmed the end of the session. */
  ended: boolean;
  /** Called when the queue runs dry, so the session can continue. */
  refillQueue: (() => readonly QueueItem[]) | null;
}

/** The events of the fishing mode. */
export type FishingEvent =
  /** The player taps "Cast". */
  | { type: 'cast' }
  /** The bobber hit the water. */
  | { type: 'cast_landed' }
  /** A fish bites: the catch is rolled and the next card is pulled. */
  | { type: 'bite' }
  /** The player taps "Reel". */
  | { type: 'reel' }
  /** The player answered the question. */
  | {
      type: 'answer';
      choiceIndex: number;
      durationMs: number;
      now: number;
      /**
       * `true` when the player graded itself (a card without wrong answers):
       * the rating is `Good` or `Again`, never the automatic one.
       */
      selfGrade?: boolean;
    }
  /**
   * The player tapped on after an answer.
   *
   * `now` is the time of the tap: a wrong answer is ignored until its
   * lockout is over. A correct answer goes on to the reel at once.
   */
  | { type: 'answer_hold_done'; now?: number }
  /** The fish was dragged out of the water. */
  | { type: 'reel_finished' }
  /** The reveal (or the "it got away" bubble) is dismissed. */
  | { type: 'continue' }
  /** The player taps "End". */
  | { type: 'request_end' }
  /** The end sheet is cancelled. */
  | { type: 'cancel_end' }
  /** The end sheet is confirmed: the session is over. */
  | { type: 'confirm_end' }
  /** The queue was (re)built by the app. */
  | { type: 'set_queue'; queue: readonly QueueItem[] };

/** How a fishing session is created. */
export interface FishingMachineOptions {
  /** The random source of the session. */
  rng: Rng;
  /** The cards that are asked, in order. */
  queue?: readonly QueueItem[];
  /** Called when the queue runs dry. */
  refillQueue?: (() => readonly QueueItem[]) | null;
  /** The bait that is equipped. */
  baits?: EquippedBaits;
  /** The rank the session starts at (the starting lure of the shop). */
  startRank?: number;
  /** The pack tickets that were already earned today. */
  packTicketsToday?: number;
  /** The season, for the seasonal catches. */
  season?: FishingSeason | null;
  /** The pack the critter catch is drawn from. */
  critterPackId?: string;
  /**
   * The time the session starts (epoch milliseconds).
   *
   * It decides which packs are on sale during the session. Defaults to
   * `Date.now()`.
   */
  now?: number;
  /** The scheduling states of the cards. */
  cardStates?: Iterable<[string, CardState]>;
}

/** Creates the initial state of a fishing session. */
export function createFishingState(options: FishingMachineOptions): FishingState {
  const baits = options.baits ?? EMPTY_BAITS;
  const cardStates = new Map<string, CardState>(options.cardStates ?? []);

  const session: FishingSession = {
    rng: options.rng,
    queue: options.queue ?? [],
    queueIndex: 0,
    cardStates,
    roll: createRollState({
      lureRank: clampRank(options.startRank ?? 1),
      packTicketsToday: options.packTicketsToday ?? 0,
      baits,
    }),
    haulLbs: 0,
    catches: 0,
    correct: 0,
    answered: 0,
    streak: 0,
    bestStreak: 0,
    byTier: emptyTierCounts(),
    log: [],
    critters: [],
    packTickets: 0,
    biggest: null,
    reviews: [],
    season: options.season ?? null,
    critterPackId: options.critterPackId ?? 'brain_buddies',
    now: options.now ?? Date.now(),
  };

  return {
    phase: 'idle',
    resumePhase: 'idle',
    session,
    currentItem: null,
    question: null,
    onTheLine: null,
    landing: [],
    reveal: null,
    feedback: null,
    lockoutUntil: null,
    ended: false,
    refillQueue: options.refillQueue ?? null,
  };
}

/**
 * The reducer of the fishing mode.
 *
 * Every event that does not fit the current phase is ignored, so the app can
 * fire events freely (for example a delayed "cast_landed" after the player
 * already tapped "End").
 */
export function fishingReducer(state: FishingState, event: FishingEvent): FishingState {
  switch (event.type) {
    case 'cast':
      return state.phase === 'idle'
        ? {
            ...state,
            phase: 'casting',
            onTheLine: null,
            landing: [],
            feedback: null,
            lockoutUntil: null,
          }
        : state;

    case 'cast_landed':
      return state.phase === 'casting' ? { ...state, phase: 'waiting' } : state;

    case 'bite':
      return state.phase === 'waiting' ? handleBite(state) : state;

    case 'reel':
      return state.phase === 'hooked' ? { ...state, phase: 'question' } : state;

    case 'answer':
      return state.phase === 'question' ? handleAnswer(state, event) : state;

    case 'answer_hold_done':
      return state.phase === 'answered' ? handleAnswerHoldDone(state, event.now) : state;

    case 'reel_finished':
      return state.phase === 'reeling' ? handleReelFinished(state) : state;

    case 'continue':
      if (state.phase === 'reveal' || state.phase === 'got_away') {
        const session =
          state.phase === 'reveal' ? commitLanding(state.session, state.landing) : state.session;
        return {
          ...state,
          phase: 'idle',
          session,
          currentItem: null,
          question: null,
          onTheLine: null,
          landing: [],
          reveal: null,
          feedback: null,
          lockoutUntil: null,
        };
      }
      return state;

    case 'request_end':
      if (state.phase === 'end_confirm') {
        return state;
      }
      return { ...state, phase: 'end_confirm', resumePhase: state.phase };

    case 'cancel_end':
      return state.phase === 'end_confirm' ? { ...state, phase: state.resumePhase } : state;

    case 'confirm_end':
      return state.phase === 'end_confirm' ? { ...state, ended: true } : state;

    case 'set_queue':
      if (state.phase !== 'idle') {
        return state;
      }
      return {
        ...state,
        session: { ...state.session, queue: event.queue, queueIndex: 0 },
      };
  }
}

/**
 * A fish bites: the catch is rolled and the next card of the FSRS queue is
 * pulled. Both happen here, so the shadow on the line can already hint at
 * the size of the catch while the question is asked.
 */
function handleBite(state: FishingState): FishingState {
  const { item, session } = pullNextItem(state);

  const roll = rollCatch(session.rng, { ...session.roll, correctCount: session.correct }, {
    bonus: item?.bonus ?? false,
    season: session.season,
    critterPackId: session.critterPackId,
    now: session.now,
  });

  const nextSession: FishingSession = { ...session, roll: roll.state };

  return {
    ...state,
    phase: 'hooked',
    session: nextSession,
    currentItem: item,
    question: item === null ? null : toQuestion(item),
    onTheLine: roll.outcome,
    landing: [],
    reveal: null,
    feedback: null,
  };
}

/** The player answered the question. */
function handleAnswer(
  state: FishingState,
  event: Extract<FishingEvent, { type: 'answer' }>,
): FishingState {
  const item = state.currentItem;
  if (item === null) {
    return state;
  }

  const answerIndex = item.card.answerIndex ?? -1;
  const correct = event.choiceIndex === answerIndex;
  // A card without wrong answers is graded by the player itself: "Got it" is
  // `Good`, "Missed it" is `Again`. Every other card is graded by the
  // automatic grader.
  const rating =
    event.selfGrade === true
      ? correct
        ? Rating.Good
        : Rating.Again
      : autoRating({
          correct,
          durationMs: event.durationMs,
          streak: state.session.streak,
        });
  // `autoRating` never grades "Manual", but the FSRS API only accepts the
  // four real grades.
  /* v8 ignore next -- `autoRating` never returns "Manual" */
  const fsrsGrade: Grade = rating === Rating.Manual ? Rating.Good : rating;

  const previousState = state.session.cardStates.get(item.cardId) ?? item.state;
  const graded = grade(item.card, previousState, fsrsGrade, new Date(event.now));

  const review: FishingReview = {
    cardId: item.cardId,
    rating: fsrsGrade,
    durationMs: event.durationMs,
    reviewedAt: event.now,
    state: graded.state,
    log: graded.log,
  };

  const cardStates = new Map(state.session.cardStates);
  cardStates.set(item.cardId, graded.state);

  const session: FishingSession = {
    ...state.session,
    cardStates,
    answered: state.session.answered + 1,
    correct: state.session.correct + (correct ? 1 : 0),
    streak: correct ? state.session.streak + 1 : 0,
    bestStreak: correct ? Math.max(state.session.bestStreak, state.session.streak + 1) : state.session.bestStreak,
    reviews: [...state.session.reviews, review],
    roll: { ...state.session.roll, correctCount: state.session.correct + (correct ? 1 : 0) },
  };

  const feedback: FishingFeedback = {
    correct,
    answerIndex,
    choiceIndex: event.choiceIndex,
    retry: false,
  };

  if (!correct) {
    // The Second Chance keeps the fish on the line so the card can be
    // retried. The miss is logged as "Again" either way.
    if (session.roll.powerup === 'second_chance') {
      return {
        ...state,
        phase: 'answered',
        session: {
          ...session,
          roll: { ...session.roll, powerup: null },
        },
        feedback: { ...feedback, retry: true },
        landing: [],
        lockoutUntil: null,
      };
    }

    return {
      ...state,
      phase: 'answered',
      session,
      feedback,
      landing: [],
      lockoutUntil: event.now + WRONG_LOCKOUT_MS,
    };
  }

  // A correct answer lands the catch. The Double Hook lands a second one.
  /* v8 ignore next -- the catch is always on the line while a card is asked */
  const landing: RolledCatch[] = state.onTheLine === null ? [] : [state.onTheLine];
  let nextSession = session;

  if (session.roll.powerup === 'double_hook' && state.onTheLine !== null) {
    const extra = rollCatch(session.rng, { ...session.roll, correctCount: session.correct }, {
      bonus: item.bonus,
      season: session.season,
      critterPackId: session.critterPackId,
      now: session.now,
    });
    nextSession = { ...session, roll: extra.state };
    if (isCatchOutcome(extra.outcome)) {
      landing.push(extra.outcome);
    }
    nextSession = { ...nextSession, roll: { ...nextSession.roll, powerup: null } };
  }

  return {
    ...state,
    phase: 'answered',
    session: nextSession,
    landing,
    feedback,
    lockoutUntil: null,
  };
}

/**
 * The player tapped on after an answer.
 *
 * The Second Chance puts the player back on the same card (the answers are
 * live again). A correct answer goes on to the lead-up before the reveal. A
 * wrong answer waits for the 3 second lockout: a tap before it is over is
 * ignored, a tap after it shows the "Fish Lost!" bubble.
 */
function handleAnswerHoldDone(state: FishingState, now?: number): FishingState {
  if (state.feedback?.retry === true) {
    return { ...state, phase: 'question', lockoutUntil: null };
  }

  if (state.feedback?.correct === true) {
    return { ...state, phase: 'reeling', lockoutUntil: null };
  }

  if (now !== undefined && state.lockoutUntil !== null && now < state.lockoutUntil) {
    return state;
  }

  return { ...state, phase: 'got_away', landing: [], lockoutUntil: null };
}

/**
 * The fish was dragged out of the water.
 *
 * Nothing is added to the haul yet: the reveal card shows the catch and the
 * haul ticks up when the player claims it (`continue`).
 */
function handleReelFinished(state: FishingState): FishingState {
  if (state.landing.length === 0) {
    // Nothing came out of the water: the line snapped and the catch is
    // gone. The bubble of the "it lost" takes over from here.
    return { ...state, phase: 'got_away', lockoutUntil: null };
  }

  return {
    ...state,
    phase: 'reveal',
    reveal: pickReveal(state.landing),
    lockoutUntil: null,
  };
}

/**
 * Adds the catches of the reveal to the session.
 *
 * The landing holds every catch of the answer (the Double Hook can land two)
 * and the special that came with it (a pack ticket). The claim is the moment
 * the haul, the log, the critter list and the ticket count move.
 */
function commitLanding(session: FishingSession, landing: readonly RolledCatch[]): FishingSession {
  let haulLbs = session.haulLbs;
  let catches = session.catches;
  const byTier = { ...session.byTier };
  const log = [...session.log];
  const critters = [...session.critters];
  let packTickets = session.packTickets;
  let biggest = session.biggest;

  for (const entry of landing) {
    if (isCatchOutcome(entry)) {
      const caught = toCaughtCatch(entry);
      haulLbs += caught.lbs;
      catches += 1;
      /* v8 ignore next -- every tier starts at zero */
      byTier[caught.tier] = (byTier[caught.tier] ?? 0) + 1;
      log.push(caught);
      if (biggest === null || caught.lbs > biggest.lbs) {
        biggest = caught;
      }
      if (entry.kind === 'critter') {
        critters.push({
          critterId: entry.critter.id,
          name: entry.critter.name,
          rarity: entry.critter.rarity,
          tier: entry.tier,
          lbs: entry.lbs,
          emoji: entry.critter.emoji,
          assetId: entry.critter.assetId,
        });
      }
    } else if (entry.kind === 'pack_ticket') {
      packTickets += 1;
    }
  }

  return {
    ...session,
    haulLbs,
    catches,
    byTier,
    log,
    critters,
    packTickets,
    biggest,
  };
}

/**
 * The catch the reveal card shows: the biggest catch of the landing (the
 * Double Hook can land two) or the special that was caught.
 */
function pickReveal(landing: readonly RolledCatch[]): RolledCatch | null {
  let reveal: RolledCatch | null = null;

  for (const entry of landing) {
    if (reveal === null) {
      reveal = entry;
      continue;
    }
    if (isCatchOutcome(entry) && isCatchOutcome(reveal) && entry.lbs > reveal.lbs) {
      reveal = entry;
    }
  }

  return reveal;
}

/** The lead-up that comes before the reveal card. */
export interface FishingLeadUp {
  /** How long the lead-up lasts. */
  durationMs: number;
  /** `true` when the catch gets away (the line snaps at the end). */
  escaped: boolean;
}

/**
 * The lead-up that comes before the reveal card.
 *
 * A catch is never on the card out of nowhere: the bobber dips, the fish
 * pulls on the line and the catch comes out of the water. A critter (or a
 * heavy catch) gets the full show, a junk catch and a wrong answer get the
 * short one.
 */
export function leadUpOf(state: FishingState): FishingLeadUp {
  const escaped = state.feedback !== null && !state.feedback.correct;
  const showTime = state.landing.some(
    (entry) => entry.kind === 'critter' || entry.kind === 'heavy' || entry.kind === 'fish',
  );

  return {
    durationMs: escaped || !showTime ? LEAD_UP_SHORT_MS : LEAD_UP_FULL_MS,
    escaped,
  };
}

/** Takes the next card of the queue (and refills it when it runs dry). */
function pullNextItem(state: FishingState): { item: QueueItem | null; session: FishingSession } {
  let { queue, queueIndex } = state.session;

  if (queueIndex >= queue.length) {
    const refilled = state.refillQueue?.() ?? [];
    queue = refilled;
    queueIndex = 0;
  }

  const item = queue[queueIndex] ?? null;
  const session: FishingSession = { ...state.session, queue, queueIndex: queueIndex + 1 };

  return { item, session };
}

/** Turns a queue item into the question the scene shows. */
function toQuestion(item: QueueItem): FishingQuestion {
  const choices = item.card.choices ?? [];
  const wrong = item.card.wrong ?? [];
  return {
    cardId: item.cardId,
    prompt: item.card.front,
    choices,
    answerIndex: item.card.answerIndex ?? -1,
    // A card without wrong answers of its own is a self-graded card.
    selfGrade: wrong.length === 0,
    answer: item.card.back.trim(),
    bonus: item.bonus,
    kind: item.kind,
  };
}

/** Turns a rolled catch into the shape the UI and the session log use. */
function toCaughtCatch(landing: CatchOutcome): CaughtCatch {
  return {
    id: landing.catch.id,
    name: landing.catch.name,
    tier: landing.tier,
    lbs: landing.lbs,
    kind: landing.kind,
    emoji: landing.catch.emoji,
    assetId: landing.catch.assetId,
    ...(landing.catch.joke === undefined ? {} : { joke: landing.catch.joke }),
    ...(landing.catch.critterId === undefined ? {} : { critterId: landing.catch.critterId }),
  };
}

function emptyTierCounts(): Record<CatchTier, number> {
  const counts = {} as Record<CatchTier, number>;
  for (const tier of CATCH_TIER_ORDER) {
    counts[tier] = 0;
  }
  return counts;
}

function clampRank(rank: number): number {
  if (!Number.isFinite(rank)) {
    return 1;
  }
  return Math.min(5, Math.max(1, Math.floor(rank)));
}

/** How many cards are still to be asked. */
export function remainingCards(state: FishingState): number {
  return Math.max(0, state.session.queue.length - state.session.queueIndex);
}

/** The biggest catch of the session, if there is one. */
export function biggestCatch(state: FishingState): CaughtCatch | null {
  return state.session.biggest;
}

/**
 * The result of the session.
 *
 * The critters are the ones that were caught (they count for the haul and for
 * the payout screen) and the pack tickets are validated by the API when the
 * session ends, exactly like the tokens (which the server computes from the
 * review logs). A caught critter never grants a critter to the collection.
 */
export interface FishingSessionResult {
  mode: 'fishing';
  answered: number;
  correct: number;
  catches: number;
  haulLbs: number;
  byTier: Record<CatchTier, number>;
  biggest: CaughtCatch | null;
  /** The critters that were caught (never granted to the collection). */
  critters: CritterCatchRecord[];
  packTickets: number;
  /** How many heavy catches landed (every one of them pays a token bonus). */
  heavyCatches: number;
  lureRank: number;
  log: CaughtCatch[];
  reviews: FishingReview[];
}

/** How well the player knows the card that is on the note. */
export type MasteryStatus = 'unknown' | 'familiar' | 'mastered';

/**
 * The small mastery badge of the question note.
 *
 * The status comes from the FSRS state of the card: a card that was never
 * reviewed is unknown, a card in the learning steps (or a young review card)
 * is familiar, and a review card with a stability of at least three weeks is
 * mastered. A session never invents a status of its own.
 */
export function masteryStatusOf(state: CardState | null | undefined): MasteryStatus {
  if (state === null || state === undefined) {
    return 'unknown';
  }
  if (state.state === State.New && state.reps === 0) {
    return 'unknown';
  }
  if (state.state === State.Review && state.stability >= 21) {
    return 'mastered';
  }
  return 'familiar';
}

/** Builds the result of the session for the payout screen and the API. */
export function toSessionResult(state: FishingState): FishingSessionResult {
  return {
    mode: 'fishing',
    answered: state.session.answered,
    correct: state.session.correct,
    catches: state.session.catches,
    haulLbs: state.session.haulLbs,
    byTier: { ...state.session.byTier },
    biggest: state.session.biggest,
    critters: [...state.session.critters],
    packTickets: state.session.packTickets,
    heavyCatches: state.session.log.filter((entry) => entry.kind === 'heavy').length,
    lureRank: state.session.roll.lureRank,
    log: [...state.session.log],
    reviews: [...state.session.reviews],
  };
}
