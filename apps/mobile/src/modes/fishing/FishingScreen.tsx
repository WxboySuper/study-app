import {
  buildQueue,
  computePayout,
  countStudyProgress,
  isCatchOutcome,
  localDayKey,
  createFishingState,
  createRandomRng,
  fishingReducer,
  remainingCards,
  toSessionResult,
  type CardState,
  type FishingEvent,
  type FishingState,
  type QueueItem,
  type QueueScope,
  type StudyCard,
} from '@study-app/core';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { openLocalStore } from '@/db/local';
import { useReduceMotion, useSettings, type ScopeChoice } from '@/settings';

import { HookedBanner } from './HookedBanner';
import { Hud } from './Hud';
import { hapticBite, hapticCast, hapticCorrect, hapticLegend, hapticReel, hapticWrong } from './haptics';
import { LakeScene } from './LakeScene';
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
const REELING_DURATION_MS = 900;
const GOT_AWAY_MS = 1_500;
const NEW_CARD_CAP = 20;

export interface FishingScreenProps {
  /** What is being studied. */
  scope: ScopeChoice;
  /** Called when the player goes home. */
  onHome: () => void;
  /** Called when the player plays the same scope again. */
  onPlayAgain: () => void;
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

export function FishingScreen({ scope, onHome, onPlayAgain }: FishingScreenProps) {
  const reduceMotion = useReduceMotion();
  const { autoReel, bait } = useSettings();

  const cardsRef = useRef<StudyCard[]>([]);
  const statesRef = useRef<Map<string, CardState>>(new Map());
  const questionStartedAt = useRef(Date.now());
  const persistedRef = useRef(0);
  const sessionIdRef = useRef(`fishing-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [settledTokens, setSettledTokens] = useState<number | null>(null);
  const [newCritterIds, setNewCritterIds] = useState<ReadonlySet<string>>(new Set());
  /** The critters the player already owns (for the "NEW!" stamp). */
  const [ownedCritters, setOwnedCritters] = useState<ReadonlySet<string>>(new Set());

  const queueScope = useMemo<QueueScope>(() => {
    switch (scope.kind) {
      case 'all':
        return { kind: 'all' };
      case 'topic':
        return { kind: 'topic', topicId: scope.id };
      case 'set':
        return { kind: 'set', setId: scope.id };
    }
  }, [scope]);

  const buildQueueNow = useCallback((): QueueItem[] => {
    return buildQueue(cardsRef.current, statesRef.current, Date.now(), {
      newCap: NEW_CARD_CAP,
      scope: queueScope,
    });
  }, [queueScope]);

  const [machine, dispatch] = useReducer(
    screenReducer,
    undefined,
    () =>
      createFishingState({
        rng: createRandomRng(),
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
        if (cancelled) {
          return;
        }
        cardsRef.current = buildQuestionCards(cards);
        statesRef.current = states;
        dispatch({ type: 'set_queue', queue: buildQueueNow() });

        // The collection knows which critters are already owned: a critter
        // that is new gets the "NEW!" stamp on the reveal card.
        const collection = await store.readCollection();
        if (cancelled) {
          return;
        }
        setOwnedCritters(new Set(collection.keys()));

        // The wallet knows how many pack tickets were already earned today:
        // the mode must not roll a second one.
        const wallet = await store.readWallet(localDayKey(new Date()));
        if (cancelled) {
          return;
        }
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
  }, [buildQueueNow]);

  // The sounds.
  useEffect(() => {
    void prepareSfx();
  }, []);

  // The phase drives the sound, the haptics and the delays.
  useEffect(() => {
    switch (machine.phase) {
      case 'casting': {
        playSfx('cast');
        hapticCast();
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
      case 'reeling': {
        playSfx('reel');
        hapticReel();
        const timer = setTimeout(() => {
          dispatch({ type: 'reel_finished' });
        }, REELING_DURATION_MS);
        return () => {
          clearTimeout(timer);
        };
      }
      case 'reveal': {
        const landed = machine.reveal;
        const tier = landed !== null && isCatchOutcome(landed) ? landed.tier : null;
        if (tier === 'cotd' || tier === 'legend') {
          playSfx('legend');
          hapticLegend();
        } else {
          playSfx('reveal');
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
  }, [machine.phase, machine.reveal]);

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
        break;
      default:
        break;
    }
  }, [machine.onTheLine]);

  // The bite.
  useEffect(() => {
    if (machine.phase === 'hooked') {
      playSfx('bite');
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

  const onAnswer = useCallback((choiceIndex: number) => {
    const now = Date.now();
    dispatch({
      type: 'answer',
      choiceIndex,
      durationMs: Math.max(0, now - questionStartedAt.current),
      now,
    });
  }, []);

  const onReel = useCallback(() => {
    dispatch({ type: 'reel' });
  }, []);

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
      hapticCorrect();
    } else {
      playSfx('wrong');
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
      tokensToday: 0,
    }).tokens;
  }, [result.correct, result.reviews]);
  const tokens = settledTokens ?? estimate;

  // Credit the wallet and the collection once, when the session ends.
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
            critterIds: final.critters.map((critter) => critter.critterId),
            packTickets: final.packTickets,
          },
          localDayKey(new Date()),
        );
        if (settlement !== null) {
          setSettledTokens(settlement.payout.tokens);
          setNewCritterIds(
            new Set(settlement.critters.filter((critter) => !critter.duplicate).map((critter) => critter.critterId)),
          );
        }
      } catch {
        // The estimate stays on screen; nothing was credited.
      }
    })();
  }, [ended]);

  if (machine.ended) {
    return (
      <PayoutScreen
        result={result}
        tokens={tokens}
        newCritterIds={newCritterIds}
        onPlayAgain={onPlayAgain}
        onHome={onHome}
        reduceMotion={reduceMotion}
      />
    );
  }

  const biggestTier = machine.session.biggest?.tier ?? null;
  const frenzy = machine.session.roll.frenzyCatchesLeft > 0;
  const onTheLine = machine.onTheLine;
  const hintTier = onTheLine !== null && isCatchOutcome(onTheLine) ? onTheLine.tier : null;
  const nothingToStudy = !loading && machine.session.queue.length === 0;

  // A critter that is not in the collection yet (and that was not caught
  // earlier in this session) is new.
  const revealIsNew = useMemo(() => {
    const revealed = machine.reveal;
    if (revealed === null || revealed.kind !== 'critter') {
      return false;
    }
    if (ownedCritters.has(revealed.critter.id)) {
      return false;
    }
    return machine.session.critters.filter((entry) => entry.critterId === revealed.critter.id).length === 1;
  }, [machine.reveal, machine.session.critters, ownedCritters]);

  return (
    <View style={styles.container}>
      <LakeScene
        phase={machine.phase}
        hintTier={hintTier}
        frenzy={frenzy}
        reduceMotion={reduceMotion}
      />

      <Hud
        session={machine.session}
        remaining={remainingCards(machine)}
        biggestTier={biggestTier}
        onEnd={onRequestEnd}
        reduceMotion={reduceMotion}
      />

      <HookedBanner
        visible={machine.phase === 'hooked'}
        reduceMotion={reduceMotion}
        onReel={onReel}
      />

      <QuestionNote
        visible={machine.phase === 'question' || machine.phase === 'reeling'}
        question={machine.question}
        feedback={machine.feedback}
        onAnswer={onAnswer}
        reduceMotion={reduceMotion}
      />

      {machine.phase === 'reveal' && machine.reveal !== null ? (
        <RevealCard
          visible
          catch={machine.reveal}
          isNew={revealIsNew}
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
            <Text style={styles.gotAwayAnswer}>
              {machine.question === null
                ? ''
                : (machine.question.choices[machine.feedback?.answerIndex ?? 0] ?? '')}
            </Text>
          </View>
        </View>
      ) : null}

      {machine.phase === 'idle' ? (
        <Pressable
          accessibilityRole="button"
          onPress={onCast}
          disabled={loading || nothingToStudy}
          style={({ pressed }) => [styles.castButton, pressed && styles.castPressed]}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.castLabel}>{nothingToStudy ? 'No cards yet' : 'Cast'}</Text>
          )}
        </Pressable>
      ) : null}

      {machine.phase === 'question' && machine.question === null ? (
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>No cards left</Text>
            <Text style={styles.sheetBody}>
              There is nothing left to study in this scope. End the session to see the haul.
            </Text>
            <View style={styles.sheetActions}>
              <Pressable
                accessibilityRole="button"
                onPress={onRequestEnd}
                style={({ pressed }) => [styles.sheetButton, styles.sheetConfirm, pressed && styles.pressed]}
              >
                <Text style={styles.sheetButtonText}>End</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {machine.phase === 'end_confirm' ? (
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Pack up?</Text>
            <Text style={styles.sheetBody}>
              {machine.session.catches} catches · {machine.session.haulLbs.toLocaleString('en-US')} lbs
            </Text>
            <View style={styles.sheetActions}>
              <Pressable
                accessibilityRole="button"
                onPress={onCancelEnd}
                style={({ pressed }) => [styles.sheetButton, styles.sheetCancel, pressed && styles.pressed]}
              >
                <Text style={styles.sheetButtonText}>Keep fishing</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onConfirmEnd}
                style={({ pressed }) => [styles.sheetButton, styles.sheetConfirm, pressed && styles.pressed]}
              >
                <Text style={styles.sheetButtonText}>End</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1020',
  },
  castButton: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 120,
    minWidth: 190,
    minHeight: 62,
    borderRadius: 999,
    backgroundColor: '#208aef',
    borderWidth: 4,
    borderColor: '#ffd166',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  castPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  castLabel: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1,
  },
  gotAway: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gotAwayCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingVertical: 16,
    alignItems: 'center',
  },
  gotAwayTitle: {
    color: '#ff6b6b',
    fontSize: 24,
    fontWeight: '900',
  },
  gotAwayAnswer: {
    marginTop: 6,
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(2, 6, 23, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    backgroundColor: '#16213e',
    borderRadius: 20,
    padding: 20,
    gap: 8,
  },
  sheetTitle: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '900',
  },
  sheetBody: {
    color: '#cbd5f5',
    fontSize: 15,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  sheetButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCancel: {
    backgroundColor: '#1f2937',
  },
  sheetConfirm: {
    backgroundColor: '#e8590c',
  },
  sheetButtonText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.8,
  },
});
