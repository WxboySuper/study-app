import {
  answerSessionQuestion,
  buildChoices,
  buildDeckClassMap,
  lurePaceFor,
  computePayout,
  countStudyProgress,
  createSessionQueue,
  filterByScope,
  filterByTrack,
  isCatchOutcome,
  localDayKey,
  gradeLabel,
  limitSessionPool,
  noteAnswered,
  parseDailyDone,
  type DailyDone,
  createFishingState,
  createRandomRng,
  createSeededRng,
  fishingReducer,
  leadUpOf,
  masteredCount,
  masteryCounts,
  masteryForecast,
  masteryProgress,
  masteryStatusOf,
  reviewWrites,
  nextSessionQuestion,
  sessionStageCounts,
  sessionStageOf,
  sessionComplete,
  sessionRemaining,
  sessionTotal,
  toSessionResult,
  updateSessionStates,
  type CardState,
  type FishingEvent,
  type FishingState,
  type MasteryProgress,
  type Milestone,
  type QueueItem,
  type QueueItemKind,
  type QueueScope,
  type Rng,
  type SessionQuestion,
  type SessionQueueState,
  type QuestionTrack,
  type SessionStage,
  type SessionStageCounts,
  type StudyCard,
  type StudyOptions,
  sessionStepsFor,
  limitGroup,
  limitKind,
  presetForLimit,
} from '@study-app/core';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openLocalStore } from '@/db/local';
import { checkMilestones } from '@/study/milestones';
import { earnDailyFreeze, recordSessionAnswers } from '@/study/streak';
import { MathText } from '@/math/MathText';
import { useReduceMotion, useSettings, type ScopeChoice } from '@/settings';
import { play } from '@/sound/sfx';
import { colors, fonts, radius, shadow } from '@/theme';
import { GameButton, GlassCard, CritterLoader } from '@/ui';
import { MASTERY_COUNTS_KEY, readMasteryCounts } from '@/study/masteryCounts';
import { dailyDoneKey, readStudyOptions } from '@/study/studyOptions';

import { HookedBanner } from './HookedBanner';
import { Hud } from './Hud';
import { hapticBite, hapticCast, hapticCorrect, hapticHeavy, hapticLegend, hapticReel, hapticWrong } from './haptics';
import { LakeScene, type LeadUpStage } from './LakeScene';
import { PayoutScreen } from './PayoutScreen';
import { QuestionNote } from './QuestionNote';
import { RevealCard } from './RevealCard';
import { STAGE_COLORS } from './stage';
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
/** The bite comes 0.7 s after the bobber lands: ~1.3 s from the cast tap. */
const BITE_DELAY_MS = 700;
/** The "Fish Lost!" bubble stays on the screen for a short moment. */
const GOT_AWAY_MS = 900;
/** The demo of the web build taps the answer after this long. */
const DEMO_CONFIRM_MS = 420;

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
  'ff2-cast': 1,
  'ff2-hooked': 1,
  'ff2-question': 10,
  'ff2-correct': 1,
  'ff2-wrong': 1,
  'ff2-reveal': 1,
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
  | 'seq-reveal'
  | 'ff2-cast'
  | 'ff2-hooked'
  | 'ff2-question'
  | 'ff2-correct'
  | 'ff2-wrong'
  | 'ff2-reveal';

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
   * The session plays today's Anki queue (due reviews, learning steps and
   * the new questions the daily limits allow) and stops on the
   * Done-for-today screen.
   */
  mastery?: boolean;
  /**
   * The questions the session plays: multiple choice (the default) or math.
   * A session never mixes the two; math has its own daily queue.
   */
  track?: QuestionTrack;
  /** Done for today: keep playing the same scope in Normal mode. */
  onKeepPlaying?: () => void;
  /** Called when the player goes home. */
  onHome: () => void;
  /** Called when the player plays the same scope again. */
  onPlayAgain: () => void;
  /** Starts a calm session with only these questions (the ones that were missed). */
  onRetryMissed?: (cardIds: string[]) => void;
  /** Restricts the session to these questions (a retry of the missed ones). */
  onlyCardIds?: readonly string[] | null;
  /** `true` to play only the questions that are due (or learning) right now. */
  dueOnly?: boolean;
  /** The decks of a session that studies several decks together. */
  setIds?: readonly string[] | null;
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

/** Saves the mastery progress of a session (merged into the saved counts). */
function saveMasteryCounts(state: Parameters<typeof masteryCounts>[0]): void {
  if (state.mode !== 'mastery') {
    return;
  }
  void (async () => {
    try {
      const store = await openLocalStore();
      const saved = await readMasteryCounts(store);
      await store.writeKv(
        MASTERY_COUNTS_KEY,
        JSON.stringify({ ...saved, ...masteryCounts(state) }),
      );
    } catch {
      // The progress of the session still counts in the session itself.
    }
  })();
}

export function FishingScreen({ scope, mastery = false, track = 'mc', onHome, onPlayAgain, onRetryMissed, onlyCardIds = null, dueOnly = false, setIds = null, onKeepPlaying, demo = null }: FishingScreenProps) {
  const reduceMotion = useReduceMotion();
  const { bait } = useSettings();
  const insets = useSafeAreaInsets();

  const cardsRef = useRef<StudyCard[]>([]);
  const statesRef = useRef<Map<string, CardState>>(new Map());
  /** The states graded in this session (a card that came back is a repeat, not new). */
  const gradedRef = useRef<ReadonlyMap<string, CardState>>(new Map());
  /** The Mastery inputs of the forecast on the Done-for-today screen. */
  const forecastInputRef = useRef<{
    options: StudyOptions;
    scoped: StudyCard[];
    classOf: (deckId: string) => string | null | undefined;
  } | null>(null);
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
  /** The mastery milestones that this session crossed. */
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  /** The tokens of the player (the HUD counts them). */
  const [balance, setBalance] = useState(0);
  /** The progress of the session (the HUD shows it in mastery mode). */
  const [progress, setProgress] = useState({
    mastered: 0,
    total: 0,
    left: 0,
    dots: [] as readonly MasteryProgress[],
    today: null as SessionStageCounts | null,
  });
  /** `true` while the "MASTERED!" celebration is on the screen. */
  const [celebrating, setCelebrating] = useState(false);
  /** `true` once today's queue is done, until the last catch is claimed. */
  const [celebratePending, setCelebratePending] = useState(false);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // The route builds a new scope object on every render: depend on its
    // fields, or every re-render of the route rebuilt the session queue and
    // wiped the mastery progress.
  }, [scope.kind, 'id' in scope ? scope.id : null]);

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

      // A card that was already graded in this session is no longer new: it is
      // due again (a learning step) or a repeat, so it never rolls the critter
      // special or a ticket as a first look would.
      const state = gradedRef.current.get(question.id) ?? question.state;
      const kind: QueueItemKind =
        state === undefined ? 'new' : state.due <= Date.now() ? 'due' : 'bonus';

      return {
        cardId: question.id,
        card: { ...question.card, choices: built.options, answerIndex: built.answerIndex },
        kind,
        bonus: kind === 'bonus',
        ...(state === undefined ? {} : { state }),
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
  const servedStageRef = useRef<{ id: string; stage: SessionStage } | null>(null);
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
    // The bucket the question came from (the HUD underlines it, like Anki).
    servedStageRef.current = { id: next.question.id, stage: sessionStageOf(next.state, next.question.id) };

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
  // Mastery sessions follow the daily limits of the deck presets.
  const [doneToday, setDoneToday] = useState(false);
  const [limitNote, setLimitNote] = useState<string | null>(null);
  useEffect(() => {
    if (doneToday) void earnDailyFreeze();
  }, [doneToday]);
  const doneRef = useRef<DailyDone | null>(null);

  // Load the cards of the scope and hand them to the machine.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const store = await openLocalStore();
        const cards = await store.listCards();
        const states = await store.listCardStates();
        const sets = await store.listSets();
        const savedCounts = await readMasteryCounts(store);
        if (cancelled) {
          return;
        }
        // Only the questions of the session's track (multiple choice or
        // math); the demos of the web build play every question.
        const questionCards = buildQuestionCards(cards);
        cardsRef.current = demo === null ? filterByTrack(questionCards, track) : questionCards;
        statesRef.current = states;
        deckClassesRef.current = buildDeckClassMap(sets);

        // The session plays the cards of the scope: the order is shuffled
        // and the queue of the core decides what comes next.
        const inScope = filterByScope(cardsRef.current, queueScope, deckClassesRef.current);
        const deckSet = setIds === null ? null : new Set(setIds);
        const scoped = deckSet === null ? inScope : inScope.filter((card) => deckSet.has(card.setId));
        let pool = scoped;
        if (onlyCardIds !== null) {
          const only = new Set(onlyCardIds);
          pool = scoped.filter((card) => only.has(card.id));
        }
        if (mastery) {
          const options = await readStudyOptions(store);
          const done = parseDailyDone(await store.readKv(dailyDoneKey(track)), localDayKey(new Date()));
          if (cancelled) {
            return;
          }
          doneRef.current = done;
          const classOfDeck = new Map(sets.map((set) => [set.id, set.classId]));
          forecastInputRef.current = { options, scoped, classOf: (deckId) => classOfDeck.get(deckId) };
          const limited = limitSessionPool(
            scoped.map((card) => ({ id: card.id, deckId: card.setId, state: states.get(card.id) })),
            { options, done, now: Date.now(), classOf: (deckId) => classOfDeck.get(deckId), track },
          );
          const keep = new Set(limited.questions.map((question) => question.id));
          const onlyIds = onlyCardIds === null ? null : new Set(onlyCardIds);
          pool = scoped.filter((card) => keep.has(card.id) && (onlyIds === null || onlyIds.has(card.id)));
          setDoneToday(limited.doneForToday);
          const groups = new Map(
            scoped.map((card) => [limitGroup(card.setId, classOfDeck.get(card.setId)), card.setId] as const),
          );
          const presets = new Map(
            [...groups.values()].map((deckId) => {
              const preset = presetForLimit(options, deckId, classOfDeck.get(deckId), track);
              return [preset.id, preset] as const;
            }),
          );
          const only = presets.size === 1 ? [...presets.values()][0] : undefined;
          setLimitNote(
            only === undefined
              ? 'limits per class'
              : `${only.newPerDay} new / class`,
          );
        }
        if (dueOnly) {
          const now = Date.now();
          pool = pool.filter((card) => {
            const kind = limitKind(states.get(card.id), now);
            return kind === 'due' || kind === 'learning';
          });
        }
        const stepOptions = await readStudyOptions(store);
        const classOfSet = new Map(sets.map((set) => [set.id, set.classId]));
        const steps = sessionStepsFor(
          stepOptions,
          pool.map((card) => card.setId),
          (deckId) => classOfSet.get(deckId),
          track,
        );
        if (cancelled) {
          return;
        }
        const engine = createSessionQueue({
          questions: pool.map((card) => ({
            id: card.id,
            card,
            ...(states.get(card.id) === undefined ? {} : { state: states.get(card.id) }),
          })),
          mode: mastery ? 'mastery' : 'endless',
          rng: queueRng,
          now: Date.now(),
          masteryCounts: savedCounts,
          settings: steps,
        });
        engineRef.current = engine;
        setProgress({
          mastered: masteredCount(engine),
          total: pool.length,
          left: sessionRemaining(engine),
          dots: masteryProgress(engine),
          today: sessionStageCounts(engine),
        });
        dispatch({
          type: 'set_queue',
          queue: [],
          lurePace: lurePaceFor({ mastery, questionCount: pool.length }),
          heat: !mastery,
        });

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
  }, [buildQueueNow, demo, mastery, queueRng, queueScope, track]);

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
        if (demo === 'cast' || demo === 'ff2-cast') {
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
        const nibble = setTimeout(() => {
          playSfx('nibble');
        }, Math.max(120, BITE_DELAY_MS - 260));
        const bite = setTimeout(() => {
          clearTimeout(nibble);
          dispatch({ type: 'bite' });
        }, BITE_DELAY_MS);
        return () => {
          clearTimeout(nibble);
          clearTimeout(bite);
        };
      }
      case 'question': {
        questionStartedAt.current = Date.now();
        return undefined;
      }
      case 'answered':
        // The answer waits for the player. A correct answer goes on at the
        // first tap; a wrong answer ignores taps until the 3 s lockout is
        // over, then the next tap makes the fish get away.
        return undefined;
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
        if (landed !== null && landed.kind === 'heavy') {
          // A heavy catch gets the fanfare and a heavy haptic of its own.
          playSfx('legend');
          play('legendary');
          hapticHeavy();
        } else if (tier === 'cotd' || tier === 'legend') {
          playSfx('legend');
          play('legendary');
          hapticLegend();
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

  // Keep the reviews in the local store (and in the outbox).
  //
  // Only the Mastery modes (questions and math) schedule: a plain Normal or
  // Math session keeps its answers for the stats and the history, but never
  // writes a scheduling state (no due date, no learning step, no card_state
  // sync event), so it cannot make questions due in Mastery.
  useEffect(() => {
    const reviews = machine.session.reviews;
    if (reviews.length <= persistedRef.current) {
      return;
    }

    const fresh = reviews.slice(persistedRef.current);
    persistedRef.current = reviews.length;
    fresh.forEach(() => recordSessionAnswers(1));

    void (async () => {
      try {
        const store = await openLocalStore();
        for (const review of fresh) {
          const { cardState } = reviewWrites(review, mastery);
          if (cardState !== null) {
            statesRef.current.set(review.cardId, cardState);
            await store.upsertCardState(cardState);
          }
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
  }, [machine.session.reviews, mastery]);

  // The scheduling state of a card changes with every review: the endless
  // mode needs the fresh state to know what is due and what is weak.
  useEffect(() => {
    const engine = engineRef.current;
    if (engine === null) {
      return;
    }
    engineRef.current = updateSessionStates(engine, machine.session.cardStates);
  }, [machine.session.cardStates]);

  useEffect(() => {
    gradedRef.current = machine.session.cardStates;
  }, [machine.session.cardStates]);

  const machineRef = useRef(machine);
  machineRef.current = machine;

  /**
   * The celebration of the mastery mode.
   *
   * Today's queue is empty: a short banner, then the Done-for-today
   * screen (Keep playing in Normal mode, or see the haul).
   */
  const celebrate = useCallback(() => {
    setCelebratePending(true);
  }, []);

  // The banner and the Done-for-today sheet wait for the catch of the last
  // answer to be claimed (or lost): the sheet's backdrop would otherwise
  // cover the reel and the claim card and block the taps that finish the catch.
  useEffect(() => {
    if (!celebratePending || machine.phase !== 'idle') {
      return;
    }
    setCelebratePending(false);
    setCelebrating(true);
    play('legendary');
    hapticLegend();
    celebrateTimer.current = setTimeout(() => {
      setCelebrating(false);
      setDoneToday(true);
    }, MASTERED_CELEBRATION_MS);
  }, [celebratePending, machine.phase]);

  useEffect(
    () => () => {
      if (celebrateTimer.current !== null) {
        clearTimeout(celebrateTimer.current);
      }
    },
    [],
  );

  // Counts the answer toward today's limits (once per card).
  const noteDone = useCallback((cardId: string) => {
    const done = doneRef.current;
    const card = cardsRef.current.find((item) => item.id === cardId);
    if (done === null || card === undefined) {
      return;
    }
    const next = noteAnswered(done, cardId, limitGroup(card.setId, deckClassesRef.current.get(card.setId)), statesRef.current.get(cardId), Date.now());
    if (next === done) {
      return;
    }
    doneRef.current = next;
    void openLocalStore()
      .then((store) => store.writeKv(dailyDoneKey(track), JSON.stringify(next)))
      .catch(() => undefined);
  }, [track]);

  const onAnswer = useCallback(
    (choiceIndex: number, typed?: boolean) => {
      const now = Date.now();
      const question = machineRef.current.question;
      // A typed (math) answer brings its own grade.
      const correct = typed ?? (question !== null && choiceIndex === question.answerIndex);

      // The session queue learns from the answer: a missed question comes
      // back a few questions later, and a mastered one leaves the queue.
      const engine = engineRef.current;
      if (engine !== null && question !== null) {
        noteDone(question.cardId);
        const next = answerSessionQuestion(engine, question.cardId, correct);
        engineRef.current = next;
        saveMasteryCounts(next);
        setProgress({
          mastered: masteredCount(next),
          total: sessionTotal(next),
          left: sessionRemaining(next),
          dots: masteryProgress(next),
          today: sessionStageCounts(next),
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
        ...(typed === undefined ? {} : { correct: typed }),
      });
    },
    [mastery, celebrate, noteDone],
  );

  const onMathAnswer = useCallback(
    (correct: boolean) => {
      onAnswer(-1, correct);
    },
    [onAnswer],
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
        noteDone(question.cardId);
        const next = answerSessionQuestion(engine, question.cardId, gotIt);
        engineRef.current = next;
        saveMasteryCounts(next);
        setProgress({
          mastered: masteredCount(next),
          total: sessionTotal(next),
          left: sessionRemaining(next),
          dots: masteryProgress(next),
          today: sessionStageCounts(next),
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
    [machine.question, mastery, celebrate, noteDone],
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
        const crossed = await checkMilestones();
        if (crossed.length > 0) {
          setMilestones(crossed);
          setBalance((await store.readWallet(localDayKey(new Date()))).balance);
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
      // The demo taps on after the answer, then waits for the lead-up
      // before the reveal card (it lasts longer for a critter than for a
      // junk catch, so the demo waits for the card instead of guessing).
      later(at + 980 + DEMO_CONFIRM_MS, () => {
        dispatch({ type: 'answer_hold_done', now: Date.now() });
      });
      later(at + 980 + DEMO_CONFIRM_MS + 80, () => {
        whenRevealed(0, then);
      });
    };

    /**
     * The pass-2 demos: the complete flow from the cast to the claim card.
     *
     * They are driven with the real timings of the mode (600 ms cast, 700 ms
     * bite) so the screenshots show the same beat the player sees.
     */
    if (demo !== null && demo.startsWith('ff2-')) {
      later(0, () => {
        dispatch({ type: 'cast' });
      });

      if (demo === 'ff2-cast') {
        return () => {
          cancelled = true;
          for (const timer of timers) {
            clearTimeout(timer);
          }
        };
      }

      later(CAST_DURATION_MS, () => {
        dispatch({ type: 'cast_landed' });
      });

      if (demo === 'ff2-hooked') {
        return () => {
          cancelled = true;
          for (const timer of timers) {
            clearTimeout(timer);
          }
        };
      }

      later(CAST_DURATION_MS + BITE_DELAY_MS, () => {
        dispatch({ type: 'bite' });
      });
      later(CAST_DURATION_MS + BITE_DELAY_MS + 250, () => {
        dispatch({ type: 'reel' });
      });

      if (demo === 'ff2-question') {
        return () => {
          cancelled = true;
          for (const timer of timers) {
            clearTimeout(timer);
          }
        };
      }

      later(CAST_DURATION_MS + BITE_DELAY_MS + 650, () => {
        const question = machineRef.current.question;
        if (question === null) {
          return;
        }
        dispatch({
          type: 'answer',
          choiceIndex:
            demo === 'ff2-wrong'
              ? (question.answerIndex + 1) % Math.max(question.choices.length, 1)
              : question.answerIndex,
          durationMs: 1_100,
          now: Date.now(),
        });
      });

      if (demo === 'ff2-reveal') {
        later(CAST_DURATION_MS + BITE_DELAY_MS + 650 + DEMO_CONFIRM_MS, () => {
          dispatch({ type: 'answer_hold_done', now: Date.now() });
        });
      }

      return () => {
        cancelled = true;
        for (const timer of timers) {
          clearTimeout(timer);
        }
      };
    }

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
        later(980 + DEMO_CONFIRM_MS, () => {
          dispatch({ type: 'answer_hold_done', now: Date.now() });
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

  // Done for today: when the next questions come due, and tomorrow's queue
  // (Anki's "Congratulations" screen).
  const forecast = useMemo(() => {
    const input = forecastInputRef.current;
    const done = doneRef.current;
    if (!doneToday || input === null || done === null) {
      return null;
    }
    const states = machine.session.cardStates;
    return masteryForecast(
      input.scoped.map((card) => ({
        id: card.id,
        deckId: card.setId,
        state: states.get(card.id) ?? statesRef.current.get(card.id),
      })),
      { options: input.options, done, now: Date.now(), classOf: input.classOf, track },
    );
  }, [doneToday, machine.session.cardStates, track]);

  const biggestTier = machine.session.biggest?.tier ?? null;
  const frenzy = machine.session.roll.frenzyCatchesLeft > 0;
  const onTheLine = machine.onTheLine;
  const hintTier = onTheLine !== null && isCatchOutcome(onTheLine) ? onTheLine.tier : null;
  // The mastery badge of the card that is on the screen: the scheduling
  // state of the session, then the state the card was pulled with.
  const currentMastery = masteryStatusOf(
    machine.question === null
      ? machine.currentItem?.state
      : (machine.session.cardStates.get(machine.question.cardId) ?? machine.currentItem?.state),
  );
  // The streak of the question toward mastery, for the dev pill (mastery
  // mode only). It drops back to 0 on a miss.
  const currentDot =
    mastery && machine.question !== null
      ? progress.dots.find((dot) => dot.id === machine.question?.cardId)
      : undefined;
  const masteryStreak =
    currentDot === undefined ? null : { correct: currentDot.correct, required: currentDot.required };
  // The queue of the machine holds one question at a time: the scope of the
  // session is what says whether there is something to study.
  const nothingToStudy = !loading && progress.total === 0;
  const lastReview = machine.session.reviews[machine.session.reviews.length - 1];

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
      case 'ff2-cast':
        return machine.phase === 'casting' ? 'ff2-cast' : null;
      case 'ff2-hooked':
        return machine.phase === 'hooked' ? 'ff2-hooked' : null;
      case 'ff2-question':
        return machine.phase === 'question' ? 'ff2-question' : null;
      case 'ff2-correct':
        return machine.phase === 'answered' && machine.feedback?.correct === true
          ? 'ff2-correct'
          : null;
      case 'ff2-wrong':
        return machine.phase === 'answered' && machine.feedback?.correct === false
          ? 'ff2-wrong'
          : null;
      case 'ff2-reveal':
        return machine.phase === 'reveal' ? 'ff2-reveal' : null;
      default:
        return null;
    }
  }, [demo, machine.phase]);

  // The questions that were answered wrong (rating 1 is "Again"), once each.
  const missedIds = [
    ...new Set(result.reviews.filter((review) => review.rating === 1).map((review) => review.cardId)),
  ];

  // The session is over: the payout screen takes over.
  if (machine.ended) {
    return (
      <PayoutScreen
        result={result}
        tokens={tokens}
        onPlayAgain={onPlayAgain}
        missedCount={missedIds.length}
        milestones={milestones}
        onRetryMissed={
          onRetryMissed === undefined || missedIds.length === 0
            ? undefined
            : () => {
                onRetryMissed(missedIds);
              }
        }
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
        frozen={demo === 'cast' || demo === 'ff2-cast'}
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
      <View
        style={[styles.hudStack, { paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}
        pointerEvents="box-none"
      >
        <Hud
          session={machine.session}
          remaining={progress.left}
          mastery={mastery}
          today={progress.today}
          currentStage={
            machine.question !== null && servedStageRef.current?.id === machine.question.cardId
              ? servedStageRef.current.stage
              : null
          }
          biggestTier={biggestTier}
          tokens={balance}
          onEnd={onRequestEnd}
          reduceMotion={reduceMotion}
          compact={machine.phase === 'question' || machine.phase === 'answered'}
          limitNote={limitNote}
        />

        <View style={styles.noteStack} pointerEvents="box-none">
          <QuestionNote
            visible={machine.phase === 'question' || machine.phase === 'answered'}
            question={machine.question}
            feedback={machine.feedback}
            locked={machine.phase === 'answered'}
            lockoutUntil={machine.lockoutUntil}
            mastery={currentMastery}
            masteryStreak={masteryStreak}
            stage={
              mastery && machine.question !== null && servedStageRef.current?.id === machine.question.cardId
                ? servedStageRef.current.stage
                : null
            }
            onAnswer={onAnswer}
            onSelfGrade={onSelfGrade}
            onMathAnswer={onMathAnswer}
            reduceMotion={reduceMotion}
          />

          {machine.phase === 'answered' && lastReview !== undefined ? (
            <View pointerEvents="none" style={styles.gradePill} testID="fishing-grade">
              <Text style={styles.gradeText}>{gradeLabel(lastReview.rating, lastReview.durationMs)}</Text>
            </View>
          ) : null}

          {/*
            The hold of the answer: a tap anywhere on the note area goes on
            before the wait is over. It sits above the note but inside the
            note's own box, so the "End" button of the HUD keeps working.
          */}
          {machine.phase === 'answered' ? (
            <Pressable
              testID="fishing-hold"
              accessibilityRole="button"
              accessibilityLabel={machine.feedback?.correct === false ? 'Continue after the wait' : 'Continue'}
              accessibilityHint={
                machine.feedback?.correct === false
                  ? 'A tap before the three seconds are over is ignored'
                  : 'Tap to reel the catch in'
              }
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
            <Text style={styles.gotAwayTitle}>Fish Lost!</Text>
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
            <Text style={styles.celebrationTitle}>DONE FOR TODAY!</Text>
            <Text style={styles.celebrationBody}>
              Every question due today is done.
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
          style={({ pressed }) => [styles.castWrap, { bottom: 130 + insets.bottom }, pressed && styles.castPressed]}
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
                <Text style={styles.castLabel}>{doneToday ? 'DONE FOR TODAY' : nothingToStudy ? 'NO QUESTIONS YET' : 'CAST'}</Text>
              )}
            </LinearGradient>
          </View>
        </Pressable>
      ) : null}

      {doneToday && !loading ? (
        <View style={styles.sheetBackdrop} testID="fishing-done-today">
          <GlassCard contentStyle={styles.sheet} tint={colors.ticket}>
            <Text style={styles.sheetTitle}>Done for today 🎉</Text>
            <Text style={styles.sheetBody}>
              You finished today&apos;s Mastery questions for this scope
              {machine.session.answered > 0 ? ` (${machine.session.answered} answered this session)` : ''}.
            </Text>
            {forecast !== null ? (
              <View style={styles.forecastBox} testID="fishing-forecast">
                <Text style={styles.forecastLine}>
                  {forecast.nextDueAt === null
                    ? 'Nothing else is scheduled yet.'
                    : `Next questions due ${formatNextDue(forecast.nextDueAt, Date.now())}.`}
                </Text>
                <View style={styles.forecastRow}>
                  <Text style={styles.forecastTitle}>TOMORROW</Text>
                  <Text style={[styles.forecastCount, { color: STAGE_COLORS.new }]}>{forecast.tomorrowNew} new</Text>
                  <Text style={[styles.forecastCount, { color: STAGE_COLORS.review }]}>
                    {forecast.tomorrowReviews} due
                  </Text>
                </View>
              </View>
            ) : null}
            <Text style={styles.sheetBody}>Normal mode stays open if you want to keep playing.</Text>
            <View style={styles.sheetActions}>
              {onKeepPlaying ? (
                <GameButton label="KEEP PLAYING (NORMAL)" variant="primary" size="md" onPress={onKeepPlaying} />
              ) : null}
              {machine.session.catches > 0 ? (
                <GameButton
                  label="SEE THE HAUL"
                  variant="ghost"
                  size="md"
                  onPress={() => {
                    dispatch({ type: 'request_end' });
                    dispatch({ type: 'confirm_end' });
                  }}
                />
              ) : (
                <GameButton label="HOME" variant="ghost" size="md" onPress={onHome} />
              )}
            </View>
          </GlassCard>
        </View>
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
  gradePill: {
    alignSelf: 'center',
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.85)',
  },
  gradeText: { color: '#ffffff', fontFamily: fonts.title, fontSize: 13 },
  container: {
    flex: 1,
    backgroundColor: '#0b1020',
  },
  hudStack: {
    flex: 1,
    width: '100%',
  },
  // The note sits in the thumb zone: the answers are anchored to the bottom
  // of the screen and the question right above them, the lake stays on top.
  noteStack: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
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
  forecastBox: {
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(6, 12, 28, 0.35)',
  },
  forecastLine: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    textAlign: 'center',
  },
  forecastRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  forecastTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.titleSemi,
    letterSpacing: 0.8,
  },
  forecastCount: {
    fontSize: 15,
    fontFamily: fonts.titleSemi,
  },
  sheetActions: {
    gap: 10,
    marginTop: 6,
  },
});

/** "in 12 min", "today at 3:40 PM", "tomorrow at 9:00 AM" or a date. */
export function formatNextDue(at: number, now: number): string {
  const minutes = Math.max(1, Math.round((at - now) / 60_000));
  if (minutes < 60) {
    return `in ${minutes} min`;
  }
  const time = new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = (value: number) => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  const days = Math.round((day(at) - day(now)) / 86_400_000);
  if (days <= 0) {
    return `today at ${time}`;
  }
  if (days === 1) {
    return `tomorrow at ${time}`;
  }
  return `on ${new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}
