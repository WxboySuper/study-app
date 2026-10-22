import {
  ANSWER_HOLD_MS,
  answerSessionQuestion,
  buildChoices,
  buildDeckClassMap,
  computePayout,
  countStudyProgress,
  createSessionQueue,
  filterByScope,
  isCatchOutcome,
  localDayKey,
  createFishingState,
  createRandomRng,
  createSeededRng,
  fishingReducer,
  leadUpOf,
  masteredCount,
  masteryProgress,
  nextSessionQuestion,
  sessionComplete,
  sessionRemaining,
  sessionTotal,
  toSessionResult,
  updateSessionStates,
  type CardState,
  type FishingEvent,
  type FishingState,
  type MasteryProgress,
  type QueueItem,
  type QueueItemKind,
  type QueueScope,
  type Rng,
  type SessionQuestion,
  type SessionQueueState,
  type StudyCard,
} from '@study-app/core';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { openLocalStore } from '@/db/local';
import { MathText } from '@/math/MathText';
import { useReduceMotion, useSettings, type ScopeChoice } from '@/settings';
import { play } from '@/sound/sfx';
import { colors, fonts, radius, shadow } from '@/theme';
import { GameButton, GlassCard, CritterLoader } from '@/ui';

import { HookedBanner } from './HookedBanner';
import { Hud } from './Hud';
import { hapticBite, hapticCast, hapticCorrect, hapticHeavy, hapticLegend, hapticReel, hapticWrong } from './haptics';
import { LakeScene, type LeadUpStage } from './LakeScene';
import { PayoutScreen } from './PayoutScreen';
import { QuestionNote } from './QuestionNote';
import { RevealCard } from './RevealCard';
import { buildQuestionCards } from './questions';
import { playSfx, prepareSfx } from './sfx';

/**
 * The fishing mode (docs/design/fishing.md).
 *
 * The screen wires the pure state machine of `@study-app/core` to the FSRS
 * queue of the local store, to the scene and to the sound and the haptics.
 *
 * There is no game timer anywhere: the only delays are the ones of the
 * design (the cast, the bite of 0.8 to 2.5 seconds, the reel and the "it
 * got away" bubble of 1.5 seconds). The player is never rushed.
 */

const CAST_DURATION_MS = 600;
const BITE_MIN_MS = 800;
const BITE_MAX_MS = 2_500;
const HOOKED_AUTO_REEL_MS = 600;
const GOT_AWAY_MS = 1_500;

/** How long the "MASTERED!" celebration stays on the screen. */
const MASTERED_CELEBRATION_MS = 2_800;

/**
 * The seeds of the demos.
 *
 * A demo plays with a fixed session, so the screenshots of the game are the
 * same on every run: the reveal demo lands a critter on its first catch and
 * the payout demo catches three of them.
 */
const DEMO_SEEDS: Readonly<Record<FishingDemo, number>> = {
  scene: 1,
  cast: 1,
  // The question demo lands on a question with math (the heat equation).
  question: 10,
  reveal: 1,
  payout: 3,
  layout: 1,
  'seq-highlight': 1,
  'seq-dip': 1,
  'seq-tug': 1,
  'seq-breach': 1,
  'seq-reveal': 1,
};

/**
 * The demo states of the web build.
 *
 * The screenshots of the game need the mode in a state that takes a while
 * to reach by hand (a question, a catch, the end of the session), so the
 * route can ask for one of them.
 *
 * The `seq-*` demos are the frames of the catch: the answer that is held on
 * the screen, the dip of the bobber, the tug of the fish, the breach of the
 * catch and the reveal card that comes after them.
 */
export type FishingDemo =
  | 'scene'
  | 'cast'
  | 'question'
  | 'reveal'
  | 'payout'
  | 'layout'
  | 'seq-highlight'
  | 'seq-dip'
  | 'seq-tug'
  | 'seq-breach'
  | 'seq-reveal';

/**
 * `true` when the demo freezes the game on a frame of the sequence.
 *
 * The frames are held still (the hold of the answer never ends and the
 * lead-up never finishes), so the screenshot shows exactly one moment of
 * the catch.
 */
function isSequenceDemo(demo: FishingDemo | null): boolean {
  return (
    demo === 'seq-highlight' ||
    demo === 'seq-dip' ||
    demo === 'seq-tug' ||
    demo === 'seq-breach'
  );
}

export interface FishingScreenProps {
  /** What is being studied. */
  scope: ScopeChoice;
  /**
   * `true` when the session plays in mastery mode.
   *
   * The session then lasts until every question of the scope is mastered,
   * and it ends by itself (with the "MASTERED!" celebration).
   */
  mastery?: boolean;
  /** Called when the player goes home. */
  onHome: () => void;
  /** Called when the player plays the same scope again. */
  onPlayAgain: () => void;
  /** The state the demo of the web build jumps to. */
  demo?: FishingDemo | null;
}

/**
 * The events of the screen.
 *
 * Next to the events of the machine, the screen hydrates the pack tickets
 * that were already earned today: the wallet is read when the screen opens,
 * so the mode cannot roll a second ticket on a day that already had one.
 */
type ScreenEvent = FishingEvent | { type: 'hydrate_pack_tickets'; count: number };

function screenReducer(state: FishingState, event: ScreenEvent): FishingState {
  if (event.type === 'hydrate_pack_tickets') {
    return {
      ...state,
      session: {
        ...state.session,
        roll: {
          ...state.session.roll,
          packTicketsToday: Math.max(state.session.roll.packTicketsToday, event.count),
        },
      },
    };
  }
  return fishingReducer(state, event);
}

export function FishingScreen({ scope, mastery = false, onHome, onPlayAgain, demo = null }: FishingScreenProps) {
  const reduceMotion = useReduceMotion();
  const { autoReel, bait } = useSettings();

  const cardsRef = useRef<StudyCard[]>([]);
  const statesRef = useRef<Map<string, CardState>>(new Map());
  /** The class of every deck (a class scope needs it). */
  const deckClassesRef = useRef<ReadonlyMap<string, string | null>>(new Map());
  /**
   * The queue of the session: it decides which question comes next, in
   * which order, and (in mastery mode) when the session is over.
   */
  const engineRef = useRef<SessionQueueState | null>(null);
  /** The random source of the questions (the catches have their own). */
  const queueRngRef = useRef<Rng | null>(null);
  const questionStartedAt = useRef(Date.now());
  const persistedRef = useRef(0);
  const sessionIdRef = useRef(`fishing-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [settledTokens, setSettledTokens] = useState<number | null>(null);
  /** The tokens of the player (the HUD counts them). */
  const [balance, setBalance] = useState(0);
  /** The progress of the session (the HUD shows it in mastery mode). */
  const [progress, setProgress] = useState({
    mastered: 0,
    total: 0,
    left: 0,
    dots: [] as readonly MasteryProgress[],
  });
  /** `true` while the "MASTERED!" celebration is on the screen. */
  const [celebrating, setCelebrating] = useState(false);

  const queueScope = useMemo<QueueScope>(() => {
    switch (scope.kind) {
      case 'all':
        return { kind: 'all' };
      case 'topic':
        return { kind: 'topic', topicId: scope.id };
      case 'class':
        return { kind: 'class', classId: scope.id };
      case 'set':
        return { kind: 'set', setId: scope.id };
    }
  }, [scope]);

  /**
   * The random source of the questions.
   *
   * It shuffles the order of the questions and the answers of every
   * question. The catches have their own random source, so the demos of the
   * web build still land the same fish.
   */
  if (queueRngRef.current === null) {
    queueRngRef.current =
      demo === null ? createRandomRng() : createSeededRng(DEMO_SEEDS[demo] * 7919 + 13);
  }
  const queueRng = queueRngRef.current;

  /**
   * Turns a question of the queue into a card of the machine.
   *
   * The answers are shuffled again, every time the question is asked: the
   * right answer is never always in the same place.
   */
  const toQueueItem = useCallback(
    (question: SessionQuestion): QueueItem => {
      const built = buildChoices(
        {
          question: question.card.front,
          correct: question.card.back,
          wrong: question.card.wrong ?? [],
        },
        queueRng,
      );

      const kind: QueueItemKind =
        question.state === undefined
          ? 'new'
          : question.state.due <= Date.now()
            ? 'due'
            : 'bonus';

      return {
        cardId: question.id,
        card: { ...question.card, choices: built.options, answerIndex: built.answerIndex },
        kind,
        bonus: kind === 'bonus',
        ...(question.state === undefined ? {} : { state: question.state }),
      };
    },
    [queueRng],
  );

  /**
   * The next question of the session.
   *
   * The queue of the machine is empty: the questions come from the session
   * queue of the core, one at a time.
   */
  const buildQueueNow = useCallback((): QueueItem[] => {
    const engine = engineRef.current;
    if (engine === null) {
      return [];
    }

    const next = nextSessionQuestion(engine);
    engineRef.current = next.state;

    if (next.question === null) {
      return [];
    }

    return [toQueueItem(next.question)];
  }, [toQueueItem]);

  const [machine, dispatch] = useReducer(
    screenReducer,
    undefined,
    () =>
      createFishingState({
        rng: demo === null ? createRandomRng() : createSeededRng(DEMO_SEEDS[demo]),
        baits:
          bait === null
            ? undefined
            : {
                shinySpinner: bait === 'shiny_spinner',
                glowJig: bait === 'glow_jig',
                critterChum: bait === 'critter_chum',
              },
        startRank: 1,
        // The time of the session decides which packs are on sale, so the
        // critters of a seasonal pack only swim up while it is available.
        now: Date.now(),
        refillQueue: () => buildQueueNow(),
      }),
  );

  const [loading, setLoading] = useState(true);

  // Load the cards of the scope and hand them to the machine.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const store = await openLocalStore();
        const cards = await store.listCards();
        const states = await store.listCardStates();
        const sets = await store.listSets();
        if (cancelled) {
          return;
        }
        cardsRef.current = buildQuestionCards(cards);
        statesRef.current = states;
        deckClassesRef.current = buildDeckClassMap(sets);

        // The session plays the cards of the scope: the order is shuffled
        // and the queue of the core decides what comes next.
        const pool = filterByScope(cardsRef.current, queueScope, deckClassesRef.current);
        const engine = createSessionQueue({
          questions: pool.map((card) => ({
            id: card.id,
            card,
            ...(states.get(card.id) === undefined ? {} : { state: states.get(card.id) }),
          })),
          mode: mastery ? 'mastery' : 'endless',
          rng: queueRng,
          now: Date.now(),
        });
        engineRef.current = engine;
        setProgress({
          mastered: 0,
          total: pool.length,
          left: pool.length,
          dots: masteryProgress(engine),
        });
        dispatch({ type: 'set_queue', queue: [] });

        // The wallet knows how many pack tickets were already earned today:
        // the mode must not roll a second one.
        const wallet = await store.readWallet(localDayKey(new Date()));
        if (cancelled) {
          return;
        }
        setBalance(wallet.balance);
        dispatch({ type: 'hydrate_pack_tickets', count: wallet.packTicketsToday });
      } catch {
        // Without the local store there is nothing to study; the screen shows
        // the empty state.
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [buildQueueNow, mastery, queueRng, queueScope]);

  // The sounds.
  useEffect(() => {
    void prepareSfx();
  }, []);

  /**
   * The lead-up before the reveal card.
   *
   * A critter (or a heavy catch) gets the full show, a junk catch and a
   * wrong answer get the short one.
   */
  const leadUp = useMemo(() => leadUpOf(machine), [machine]);

  // The phase drives the sound, the haptics and the delays.
  useEffect(() => {
    switch (machine.phase) {
      case 'casting': {
        playSfx('cast');
        play('cast');
        hapticCast();
        // The demo of the cast stays in the air, so the screenshot shows the
        // bobber on its way.
        if (demo === 'cast') {
          return undefined;
        }
        const timer = setTimeout(() => {
          dispatch({ type: 'cast_landed' });
        }, CAST_DURATION_MS);
        return () => {
          clearTimeout(timer);
        };
      }
      case 'waiting': {
        const wait = BITE_MIN_MS + Math.random() * (BITE_MAX_MS - BITE_MIN_MS);
        const nibble = setTimeout(() => {
          playSfx('nibble');
        }, Math.max(120, wait - 320));
        const bite = setTimeout(() => {
          clearTimeout(nibble);
          dispatch({ type: 'bite' });
        }, wait);
        return () => {
          clearTimeout(nibble);
          clearTimeout(bite);
        };
      }
      case 'question': {
        questionStartedAt.current = Date.now();
        return undefined;
      }
      case 'answered': {
        // The answer is held on the screen: the right answer turns green,
        // the wrong one turns red and the player can reread the card. A tap
        // anywhere goes on before the wait is over.
        if (isSequenceDemo(demo)) {
          return undefined;
        }
        const timer = setTimeout(() => {
          dispatch({ type: 'answer_hold_done' });
        }, ANSWER_HOLD_MS);
        return () => {
          clearTimeout(timer);
        };
      }
      case 'reeling': {
        // The lead-up before the reveal card: the bobber dips, the fish
        // pulls on the line and the catch comes out of the water.
        playSfx('reel');
        hapticReel();
        if (isSequenceDemo(demo)) {
          return undefined;
        }
        const timer = setTimeout(() => {
          dispatch({ type: 'reel_finished' });
        }, leadUp.durationMs);
        return () => {
          clearTimeout(timer);
        };
      }
      case 'reveal': {
        const landed = machine.reveal;
        const tier = landed !== null && isCatchOutcome(landed) ? landed.tier : null;
        if (tier === 'cotd' || tier === 'legend') {
          playSfx('legend');
          play('legendary');
          hapticLegend();
        } else if (tier === 'heavy') {
          // A heavy catch gets the fanfare and a heavy haptic of its own.
          playSfx('legend');
          play('legendary');
          hapticHeavy();
        } else {
          playSfx('reveal');
          play('reveal');
        }
        return undefined;
      }
      case 'got_away': {
        const timer = setTimeout(() => {
          dispatch({ type: 'continue' });
        }, GOT_AWAY_MS);
        return () => {
          clearTimeout(timer);
        };
      }
      default:
        return undefined;
    }
  }, [demo, leadUp.durationMs, machine.phase, machine.reveal]);

  // The sound of the catch that is on the line.
  useEffect(() => {
    const onTheLine = machine.onTheLine;
    if (onTheLine === null) {
      return;
    }

    switch (onTheLine.kind) {
      case 'new_lure':
        playSfx('lure');
        break;
      case 'frenzy':
        playSfx('frenzy');
        break;
      case 'powerup':
        playSfx('powerup');
        break;
      case 'pack_ticket':
        playSfx('coin');
        play('coin');
        break;
      default:
        break;
    }
  }, [machine.onTheLine]);

  // The bite.
  useEffect(() => {
    if (machine.phase === 'hooked') {
      playSfx('bite');
      play('hooked');
      hapticBite();
    }
  }, [machine.phase]);

  // The auto reel after the banner.
  useEffect(() => {
    if (machine.phase !== 'hooked' || !autoReel) {
      return undefined;
    }
    const timer = setTimeout(() => {
      dispatch({ type: 'reel' });
    }, HOOKED_AUTO_REEL_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [machine.phase, autoReel]);

  // Keep the reviews in the local store (and in the outbox).
  useEffect(() => {
    const reviews = machine.session.reviews;
    if (reviews.length <= persistedRef.current) {
      return;
    }

    const fresh = reviews.slice(persistedRef.current);
    persistedRef.current = reviews.length;

    void (async () => {
      try {
        const store = await openLocalStore();
        for (const review of fresh) {
          statesRef.current.set(review.cardId, review.state);
          await store.upsertCardState(review.state);
          await store.enqueueReview({
            ...review.log,
            clientId: `${review.cardId}-${review.reviewedAt}-${persistedRef.current}`,
            cardId: review.cardId,
            sessionId: null,
            durationMs: review.durationMs,
            createdAt: review.reviewedAt,
          });
        }
      } catch {
        // The reviews stay in the session; the sync happens later.
      }
    })();
  }, [machine.session.reviews]);

  // The scheduling state of a card changes with every review: the endless
  // mode needs the fresh state to know what is due and what is weak.
  useEffect(() => {
    const engine = engineRef.current;
    if (engine === null) {
      return;
    }
    engineRef.current = updateSessionStates(engine, machine.session.cardStates);
  }, [machine.session.cardStates]);

  const machineRef = useRef(machine);
  machineRef.current = machine;

  /**
   * The celebration of the mastery mode.
   *
   * Every question of the scope is mastered: the screen says it with a
   * banner and the session ends by itself (the payout comes next).
   */
  const celebrate = useCallback(() => {
    setCelebrating(true);
    play('legendary');
    hapticLegend();

    const timer = setTimeout(() => {
      dispatch({ type: 'request_end' });
      dispatch({ type: 'confirm_end' });
    }, MASTERED_CELEBRATION_MS);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  const onAnswer = useCallback(
    (choiceIndex: number) => {
      const now = Date.now();
      const question = machineRef.current.question;
      const correct = question !== null && choiceIndex === question.answerIndex;

      // The session queue learns from the answer: a missed question comes
      // back a few questions later, and a mastered one leaves the queue.
      const engine = engineRef.current;
      if (engine !== null && question !== null) {
        const next = answerSessionQuestion(engine, question.cardId, correct);
        engineRef.current = next;
        setProgress({
          mastered: masteredCount(next),
          total: sessionTotal(next),
          left: sessionRemaining(next),
          dots: masteryProgress(next),
        });

        if (mastery && sessionComplete(next)) {
          celebrate();
        }
      }

      dispatch({
        type: 'answer',
        choiceIndex,
        durationMs: Math.max(0, now - questionStartedAt.current),
        now,
      });
    },
    [mastery, celebrate],
  );

  const onReel = useCallback(() => {
    dispatch({ type: 'reel' });
  }, []);

  /**
   * The hold of the answer ends before the wait is over.
   *
   * The player taps anywhere to go on: the answer was on the screen long
   * enough to be read.
   */
  const onSkipHold = useCallback(() => {
    dispatch({ type: 'answer_hold_done' });
  }, []);

  // A card without wrong answers is graded by the player itself: "Got it" is
  // a Good, "Missed it" is an Again.
  const onSelfGrade = useCallback(
    (gotIt: boolean) => {
      const now = Date.now();
      const question = machineRef.current.question;

      // The session queue learns from the grade of the player too.
      const engine = engineRef.current;
      if (engine !== null && question !== null) {
        const next = answerSessionQuestion(engine, question.cardId, gotIt);
        engineRef.current = next;
        setProgress({
          mastered: masteredCount(next),
          total: sessionTotal(next),
          left: sessionRemaining(next),
          dots: masteryProgress(next),
        });

        if (mastery && sessionComplete(next)) {
          celebrate();
        }
      }

      dispatch({
        type: 'answer',
        choiceIndex: gotIt ? (machine.question?.answerIndex ?? 0) : -1,
        durationMs: Math.max(0, now - questionStartedAt.current),
        now,
        selfGrade: true,
      });
    },
    [machine.question, mastery, celebrate],
  );
  const onCast = useCallback(() => {
    dispatch({ type: 'cast' });
  }, []);

  const onRequestEnd = useCallback(() => {
    dispatch({ type: 'request_end' });
  }, []);

  const onCancelEnd = useCallback(() => {
    dispatch({ type: 'cancel_end' });
  }, []);

  const onConfirmEnd = useCallback(() => {
    dispatch({ type: 'confirm_end' });
  }, []);

  // The sound of the answer.
  const feedback = machine.feedback;
  const feedbackRef = useRef(feedback);
  useEffect(() => {
    if (feedback === null || feedback === feedbackRef.current) {
      return;
    }
    feedbackRef.current = feedback;
    if (feedback.correct) {
      playSfx('correct');
      play('correct');
      hapticCorrect();
    } else {
      playSfx('wrong');
      play('wrong');
      hapticWrong();
    }
  }, [feedback]);

  const result = useMemo(() => toSessionResult(machine), [machine]);
  const estimate = useMemo(() => {
    const progress = countStudyProgress(result.reviews);
    return computePayout({
      correct: result.correct,
      graduated: progress.graduated,
      dueCleared: progress.dueCleared,
      modeScore: 0,
      heavyCatches: result.heavyCatches,
      tokensToday: 0,
    }).tokens;
  }, [result.correct, result.reviews, result.heavyCatches]);
  const tokens = settledTokens ?? estimate;

  // Credit the wallet once, when the session ends. A catch never grants a
  // critter to the collection: only a pack does.
  const ended = machine.ended;
  const resultRef = useRef(result);
  resultRef.current = result;
  useEffect(() => {
    if (!ended) {
      return;
    }
    const final = resultRef.current;
    void (async () => {
      try {
        const store = await openLocalStore();
        const settlement = await store.settleSession(
          sessionIdRef.current,
          'fishing',
          {
            correct: final.correct,
            reviews: final.reviews,
            packTickets: final.packTickets,
            heavyCatches: final.heavyCatches,
          },
          localDayKey(new Date()),
        );
        if (settlement !== null) {
          setSettledTokens(settlement.payout.tokens);
          setBalance(settlement.wallet.balance);
        }
      } catch {
        // The estimate stays on screen; nothing was credited.
      }
    })();
  }, [ended]);

  // The demo of the web build plays the mode for the screenshot.
  useEffect(() => {
    if (demo === null || demo === 'scene' || loading) {
      return undefined;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    const later = (ms: number, run: () => void) => {
      timers.push(
        setTimeout(() => {
          if (!cancelled) {
            run();
          }
        }, ms),
      );
    };

    /** Waits for the reveal card and calls the callback. */
    const whenRevealed = (attempt: number, then?: () => void) => {
      if (then === undefined) {
        return;
      }
      if (machineRef.current.phase === 'reveal') {
        then();
        return;
      }
      if (attempt > 60) {
        return;
      }
      later(120, () => {
        whenRevealed(attempt + 1, then);
      });
    };

    // One catch: cast, bite, reel and (when the demo needs it) answer.
    const catchAt = (at: number, answer: boolean, then?: () => void) => {
      later(at, () => {
        dispatch({ type: 'cast' });
      });
      later(at + 120, () => {
        dispatch({ type: 'cast_landed' });
      });
      later(at + 280, () => {
        dispatch({ type: 'bite' });
      });
      later(at + 460, () => {
        dispatch({ type: 'reel' });
      });
      if (!answer) {
        return;
      }
      later(at + 980, () => {
        const question = machineRef.current.question;
        if (question === null) {
          return;
        }
        dispatch({
          type: 'answer',
          choiceIndex: question.answerIndex,
          durationMs: 800,
          now: Date.now(),
        });
      });
      // The lead-up before the reveal card lasts longer for a critter than
      // for a junk catch, so the demo waits for the card instead of
      // guessing how long it takes.
      later(at + 980 + ANSWER_HOLD_MS, () => {
        whenRevealed(0, then);
      });
    };

    if (demo === 'cast') {
      // The demo of the cast only throws the bobber: the scene freezes it in
      // the air, so the screenshot shows the cast in flight.
      later(0, () => {
        dispatch({ type: 'cast' });
      });
    }

    if (demo === 'question') {
      catchAt(0, false);
    }

    if (isSequenceDemo(demo)) {
      // The frames of the sequence: the demo answers the card and then
      // stops on the frame the screenshot asks for.
      later(0, () => {
        dispatch({ type: 'cast' });
      });
      later(120, () => {
        dispatch({ type: 'cast_landed' });
      });
      later(280, () => {
        dispatch({ type: 'bite' });
      });
      later(460, () => {
        dispatch({ type: 'reel' });
      });
      later(980, () => {
        const question = machineRef.current.question;
        if (question === null) {
          return;
        }
        // The frame of the answer shows both highlights: the answer the
        // player picked (red) and the right one (green). The frames of the
        // lead-up need a catch, so they answer correctly.
        const choiceIndex =
          demo === 'seq-highlight'
            ? (question.answerIndex + 1) % Math.max(question.choices.length, 1)
            : question.answerIndex;
        dispatch({
          type: 'answer',
          choiceIndex,
          durationMs: 800,
          now: Date.now(),
        });
      });
      if (demo !== 'seq-highlight') {
        // The hold of the answer ends and the lead-up starts.
        later(980 + ANSWER_HOLD_MS, () => {
          dispatch({ type: 'answer_hold_done' });
        });
      }
    }

    if (demo === 'reveal' || demo === 'seq-reveal') {
      // The demo keeps fishing until a critter comes out of the water and
      // then keeps the reveal card on the screen (for the picture).
      const tryCatch = (attempt: number) => {
        catchAt(0, true, () => {
          const reveal = machineRef.current.reveal;
          if (reveal !== null && reveal.kind === 'critter') {
            return;
          }
          // The queue of the demo runs dry at some point: the card that is
          // on the screen then stays there.
          if (attempt >= 4 || machineRef.current.question === null) {
            return;
          }
          dispatch({ type: 'continue' });
          later(120, () => {
            tryCatch(attempt + 1);
          });
        });
      };
      tryCatch(0);
    }

    if (demo === 'payout') {
      // The demo catches three critters and then packs up.
      let caught = 0;
      let attempts = 0;
      const catchCritter = () => {
        catchAt(0, true, () => {
          const reveal = machineRef.current.reveal;
          if (reveal !== null && reveal.kind === 'critter') {
            caught += 1;
          }
          attempts += 1;
          if (caught >= 3 || attempts >= 8 || machineRef.current.question === null) {
            later(300, () => {
              dispatch({ type: 'request_end' });
            });
            later(500, () => {
              dispatch({ type: 'confirm_end' });
            });
            return;
          }
          dispatch({ type: 'continue' });
          later(120, () => {
            catchCritter();
          });
        });
      };
      catchCritter();
    }

    if (demo === 'layout') {
      // Three catches fill the "previous catches" row of the HUD, then the
      // demo starts one more cast and never answers it: the screenshot keeps
      // the long math note on the screen.
      let caught = 0;
      const fishForLayout = () => {
        catchAt(0, true, () => {
          caught += 1;
          if (caught >= 3) {
            // Leave the reveal card first: the cast of the last question is
            // ignored while the catch is still on the screen.
            dispatch({ type: 'continue' });
            later(250, () => {
              catchAt(0, false);
            });
            return;
          }
          dispatch({ type: 'continue' });
          later(120, () => {
            fishForLayout();
          });
        });
      };
      fishForLayout();
    }

    return () => {
      cancelled = true;
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [demo, loading]);

  const biggestTier = machine.session.biggest?.tier ?? null;
  const frenzy = machine.session.roll.frenzyCatchesLeft > 0;
  const onTheLine = machine.onTheLine;
  const hintTier = onTheLine !== null && isCatchOutcome(onTheLine) ? onTheLine.tier : null;
  // The queue of the machine holds one question at a time: the scope of the
  // session is what says whether there is something to study.
  const nothingToStudy = !loading && progress.total === 0;

  /** The frame of the sequence the demo freezes the scene on. */
  const freezeStage = useMemo<LeadUpStage | null>(() => {
    switch (demo) {
      case 'seq-dip':
        return 'dip';
      case 'seq-tug':
        return 'tug';
      case 'seq-breach':
        return 'breach';
      default:
        return null;
    }
  }, [demo]);

  /**
   * The frame of the sequence the demo is on.
   *
   * The screenshots of the web build wait for it, so the picture is taken
   * at the right moment of the catch.
   */
  const demoFrame = useMemo<string | null>(() => {
    switch (demo) {
      case 'seq-highlight':
        return machine.phase === 'answered' ? 'highlight' : null;
      case 'seq-dip':
        return machine.phase === 'reeling' ? 'dip' : null;
      case 'seq-tug':
        return machine.phase === 'reeling' ? 'tug' : null;
      case 'seq-breach':
        return machine.phase === 'reeling' ? 'breach' : null;
      case 'seq-reveal':
        return machine.phase === 'reveal' ? 'reveal' : null;
      default:
        return null;
    }
  }, [demo, machine.phase]);

  // The session is over: the payout screen takes over.
  if (machine.ended) {
    return (
      <PayoutScreen
        result={result}
        tokens={tokens}
        onPlayAgain={onPlayAgain}
        onHome={onHome}
        reduceMotion={reduceMotion}
      />
    );
  }

  return (
    <View style={styles.container}>
      <LakeScene
        phase={machine.phase}
        hintTier={hintTier}
        frenzy={frenzy}
        reduceMotion={reduceMotion}
        landed={machine.phase === 'reeling' ? machine.onTheLine : machine.reveal}
        frozen={demo === 'cast'}
        leadUpMs={leadUp.durationMs}
        escaped={leadUp.escaped}
        freezeStage={freezeStage}
      />

      <HookedBanner
        visible={machine.phase === 'hooked'}
        reduceMotion={reduceMotion}
        onReel={onReel}
      />

      {/*
        The HUD and the question live in one normal column: the counters,
        mastery bar and previous catches stack above the note instead of
        floating over it. Nothing is absolutely positioned here, so the note
        can never be covered by the HUD.
      */}
      <View style={styles.hudStack} pointerEvents="box-none">
        <Hud
          session={machine.session}
          remaining={progress.left}
          mastery={mastery}
          mastered={progress.mastered}
          total={progress.total}
          progress={progress.dots}
          currentQuestionId={machine.question?.cardId ?? null}
          biggestTier={biggestTier}
          tokens={balance}
          onEnd={onRequestEnd}
          reduceMotion={reduceMotion}
        />

        <View style={styles.noteStack} pointerEvents="box-none">
          <QuestionNote
            visible={machine.phase === 'question' || machine.phase === 'answered'}
            question={machine.question}
            feedback={machine.feedback}
            locked={machine.phase === 'answered'}
            onAnswer={onAnswer}
            onSelfGrade={onSelfGrade}
            reduceMotion={reduceMotion}
          />

          {/*
            The hold of the answer: a tap anywhere on the note area goes on
            before the wait is over. It sits above the note but inside the
            note's own box, so the "End" button of the HUD keeps working.
          */}
          {machine.phase === 'answered' ? (
            <Pressable
              testID="fishing-hold"
              accessibilityRole="button"
              accessibilityLabel="Continue"
              accessibilityHint="Tap to continue before the answer is held any longer"
              style={StyleSheet.absoluteFill}
              onPress={onSkipHold}
            />
          ) : null}
        </View>
      </View>

      {machine.phase === 'reveal' && machine.reveal !== null ? (
        <RevealCard
          visible
          catch={machine.reveal}
          reduceMotion={reduceMotion}
          onContinue={() => {
            dispatch({ type: 'continue' });
          }}
        />
      ) : null}

      {machine.phase === 'got_away' ? (
        <View style={styles.gotAway} pointerEvents="none">
          <View style={styles.gotAwayCard}>
            <Text style={styles.gotAwayTitle}>It got away!</Text>
            <MathText
              text={
                machine.question === null
                  ? ''
                  : (machine.question.choices[machine.feedback?.answerIndex ?? 0] ?? '')
              }
              style={styles.gotAwayAnswer}
              color={colors.text}
              fontSize={16}
              center
            />
          </View>
        </View>
      ) : null}

      {celebrating ? (
        <View style={styles.celebration} pointerEvents="none">
          <View style={styles.celebrationCard}>
            <Text style={styles.celebrationTitle}>MASTERED!</Text>
            <Text style={styles.celebrationBody}>
              Every question of this deck is mastered. The session is over.
            </Text>
          </View>
        </View>
      ) : null}

      {machine.phase === 'idle' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cast the line"
          onPress={onCast}
          disabled={loading || nothingToStudy}
          style={({ pressed }) => [styles.castWrap, pressed && styles.castPressed]}
        >
          <View style={styles.castBase}>
            <LinearGradient
              colors={['#5eead4', '#0ea5e9', '#2563eb']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.4, y: 1 }}
              style={styles.castFace}
            >
              {loading ? (
                <CritterLoader emoji="🎣" size={24} style={styles.castLoader} />
              ) : (
                <Text style={styles.castLabel}>{nothingToStudy ? 'NO QUESTIONS YET' : 'CAST'}</Text>
              )}
            </LinearGradient>
          </View>
        </Pressable>
      ) : null}

      {machine.phase === 'question' && machine.question === null ? (
        <View style={styles.sheetBackdrop}>
          <GlassCard contentStyle={styles.sheet} tint={colors.ticket}>
            <Text style={styles.sheetTitle}>No questions left</Text>
            <Text style={styles.sheetBody}>
              There is nothing left to study in this scope. End the session to see the haul.
            </Text>
            <View style={styles.sheetActions}>
              <GameButton label="END THE SESSION" variant="primary" size="md" onPress={onRequestEnd} />
            </View>
          </GlassCard>
        </View>
      ) : null}

      {machine.phase === 'end_confirm' ? (
        <View style={styles.sheetBackdrop}>
          <GlassCard contentStyle={styles.sheet} tint={colors.wheel}>
            <Text style={styles.sheetTitle}>Pack up?</Text>
            <Text style={styles.sheetBody}>
              {machine.session.catches} catches · {machine.session.haulLbs.toLocaleString('en-US')} lbs
            </Text>
            <View style={styles.sheetActions}>
              <GameButton label="KEEP FISHING" variant="ghost" size="md" onPress={onCancelEnd} />
              <GameButton label="END THE SESSION" variant="wheel" size="md" onPress={onConfirmEnd} />
            </View>
          </GlassCard>
        </View>
      ) : null}

      {/*
        The marker of the frame of the sequence the demo is on. It is
        invisible: the screenshots of the web build wait for it.
      */}
      {demoFrame === null ? null : (
        <View testID={`fishing-demo-${demoFrame}`} style={styles.demoMarker} pointerEvents="none" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1020',
  },
  hudStack: {
    flex: 1,
    width: '100%',
  },
  noteStack: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-start',
  },
  demoMarker: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  },
  castWrap: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 130,
  },
  castBase: {
    borderRadius: 999,
    backgroundColor: '#075985',
    paddingBottom: 7,
    ...shadow.glow,
  },
  castFace: {
    minWidth: 200,
    minHeight: 62,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
    overflow: 'hidden',
  },
  castPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }, { translateY: 3 }],
  },
  castLabel: {
    color: '#04252f',
    fontSize: 24,
    fontFamily: fonts.title,
    letterSpacing: 2,
  },
  castLoader: {
    paddingVertical: 0,
  },
  gotAway: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gotAwayCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderRadius: radius.card,
    paddingHorizontal: 22,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.danger,
  },
  gotAwayTitle: {
    color: colors.danger,
    fontSize: 24,
    fontFamily: fonts.title,
  },
  gotAwayAnswer: {
    marginTop: 6,
    color: colors.text,
    fontSize: 16,
    fontFamily: fonts.bodyBold,
    textAlign: 'center',
  },
  celebration: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(4, 10, 24, 0.72)',
  },
  celebrationCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderRadius: radius.card,
    paddingHorizontal: 26,
    paddingVertical: 20,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.gold,
  },
  celebrationTitle: {
    color: colors.gold,
    fontSize: 34,
    fontFamily: fonts.title,
    letterSpacing: 3,
  },
  celebrationBody: {
    marginTop: 8,
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    textAlign: 'center',
    lineHeight: 19,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(2, 6, 23, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    gap: 10,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 22,
    fontFamily: fonts.title,
    textAlign: 'center',
  },
  sheetBody: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    textAlign: 'center',
    lineHeight: 19,
  },
  sheetActions: {
    gap: 10,
    marginTop: 6,
  },
});
