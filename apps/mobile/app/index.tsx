import {
  buildDeckClassMap,
  buildQueue,
  canSpin,
  countScope,
  deckSyncLines,
  filterByScope,
  filterByTrack,
  isPackAvailable,
  localDayKey,
  masteryForecast,
  parseDailyDone,
  type DailyDone,
  type DeckSyncStatus,
  type QuestionTrack,
  type StudyOptions,
  PACKS,
  type CardState,
  type StudyCard,
} from '@study-app/core';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminPanel } from '@/admin/AdminPanel';
import {
  openLocalStore,
  type LocalClass,
  type LocalSet,
} from '@/db/local';
import { RemindersSettings } from '@/reminders/RemindersSettings';
import { scopeTitle, useSettings } from '@/settings';
import { play } from '@/sound/sfx';
import {
  buildClassChips,
  buildDecks,
  queueScopeOf,
  scopeOfChip,
  scopeOfDeck,
  type ClassChip,
  type ClassFilter,
  type DeckCard,
} from '@/study/decks';
import { DeckPicker } from '@/study/DeckPicker';
import { ExamPanel } from '@/study/ExamPanel';
import { StreakCard } from '@/study/StreakCard';
import { DAILY_DONE_KEY, DAILY_DONE_MATH_KEY, readStudyOptions } from '@/study/studyOptions';
import { CreateClassSheet, EditClassSheet, MoveDeckSheet } from '@/study/ClassSheets';
import {
  getDeckSyncStatus,
  readLastSynced,
  subscribeDeckSyncStatus,
  syncDecks,
} from '@/sync/syncDecks';
import { colors, fonts, radius, spacing } from '@/theme';
import {
  appVersion,
  dismissUpdate,
  lastUpdateError,
  runUpdateCheck,
  isUpdateDismissed,
  subscribeToUpdate,
  type AvailableUpdate,
} from '@/update/checkForUpdate';
import { UpdateBanner } from '@/update/UpdateBanner';
import {
  GameBackground,
  GameButton,
  GlassCard,
  TokenCounter,
  Wordmark,
} from '@/ui';

/**
 * The home screen (SPEC "Session flow").
 *
 * Built around one question: what do I study today? A compact header, one
 * big card with today's review (new / learning / due left) and a single
 * START button, the decks below it, and the game extras (packs, book, wheel)
 * tucked into a small row. The last scope is remembered, so studying is a
 * single tap.
 */

/** How long the result of a deck sync stays on the screen. */

export default function HomeScreen() {
  const router = useRouter();
  const {
    scope,
    setScope,
    sound,
    setSound,
    haptics,
    setHaptics,
    mastery,
    setMastery,
    reduceMotion,
    setReduceMotion,
    systemReduceMotion,
  } = useSettings();

  const [sets, setSets] = useState<LocalSet[]>([]);
  const [classes, setClasses] = useState<LocalClass[]>([]);
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [cardStates, setCardStates] = useState<Map<string, CardState>>(new Map());
  const [loading, setLoading] = useState(true);
  /** The study options and today's done counts (Mastery's daily queue). */
  const [studyDay, setStudyDay] = useState<{
    options: StudyOptions;
    done: DailyDone;
    mathDone: DailyDone;
  } | null>(null);
  // The section of the home screen: multiple choice (the core of the game)
  // or Math. Each section has its own decks, queue and daily limits.
  const [track, setTrack] = useState<QuestionTrack>('mc');
  const [balance, setBalance] = useState<number | null>(null);
  const [packTickets, setPackTickets] = useState(0);
  const [critterCount, setCritterCount] = useState(0);
  const [spinReady, setSpinReady] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DeckCard | null>(null);
  /** The class whose decks are shown below the chips (`null` means "All"). */
  const [filter, setFilter] = useState<ClassFilter>({ kind: 'all' });
  /** The sheet of a new class. */
  const [creatingClass, setCreatingClass] = useState(false);
  /** The class that is renamed (or deleted). */
  const [editingClass, setEditingClass] = useState<ClassChip | null>(null);
  /** The deck that moves to another class. */
  const [movingDeck, setMovingDeck] = useState<DeckCard | null>(null);
  /** The release of the game that is newer than the app. */
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  /** What the last sync of the decks did (the Sync now bar shows it). */
  const [syncStatus, setSyncStatus] = useState<DeckSyncStatus>(getDeckSyncStatus);
  /** When the decks were last synced for real (`null`: never). */
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  /** The clock of the Sync now bar ("5 min ago" moves on by itself). */
  const [clock, setClock] = useState(() => Date.now());
  /** `true` while the hidden admin panel is open. */
  const [adminOpen, setAdminOpen] = useState(false);
  /** `true` while the 'Settings and more' section is open. */
  const [moreOpen, setMoreOpen] = useState(false);

  const totalCritters = PACKS.reduce((sum, pack) => sum + pack.critters.length, 0);
  const cheapestPack = useMemo(() => {
    const onSale = PACKS.filter((pack) => isPackAvailable(pack, Date.now()));
    if (onSale.length === 0) {
      return 0;
    }
    return Math.min(...onSale.map((pack) => pack.priceTokens));
  }, []);

  // The wallet is re-read whenever Home comes back into focus.
  const loadWallet = useCallback(async () => {
    try {
      const store = await openLocalStore();
      const today = localDayKey(new Date());
      const wallet = await store.readWallet(today);
      const collection = await store.readCollection();
      const lastSpin = await store.readLastSpin();
      setBalance(wallet.balance);
      setPackTickets(wallet.packTickets);
      setCritterCount(collection.size);
      setSpinReady(canSpin(lastSpin?.localDate ?? null, today));
    } catch {
      // The wallet stays hidden.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadWallet();
    }, [loadWallet]),
  );

  // The decks are read whenever Home comes back into focus: a deck that was
  // just imported (or deleted) shows up right away.
  const loadDecks = useCallback(async () => {
    try {
      const store = await openLocalStore();
      const localCards = await store.listCards();
      const localStates = await store.listCardStates();
      const localSets = await store.listSets();
      const localClasses = await store.listClasses();
      const options = await readStudyOptions(store);
      const day = localDayKey(new Date());
      const done = parseDailyDone(await store.readKv(DAILY_DONE_KEY), day);
      const mathDone = parseDailyDone(await store.readKv(DAILY_DONE_MATH_KEY), day);

      setStudyDay({ options, done, mathDone });
      setCards(localCards);
      setCardStates(localStates);
      setSets(localSets);
      setClasses(localClasses);
    } catch {
      // The decks stay empty: the picker shows its empty state.
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDecks();
    }, [loadDecks]),
  );

  // The Sync now bar follows the sync of the decks, the automatic one at the
  // start of the app included: a sync that failed is shown, and a sync that
  // worked refreshes the decks on the screen.
  useEffect(() => {
    void readLastSynced().then(setLastSynced);

    return subscribeDeckSyncStatus((next) => {
      setSyncStatus(next);
      if (next.state === 'ok') {
        setLastSynced(next.at);
        void loadDecks();
      }
    });
  }, [loadDecks]);

  // "Last synced 5 min ago" keeps counting while the screen is open.
  useEffect(() => {
    const timer = setInterval(() => {
      setClock(Date.now());
    }, 30_000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  // The button of the home screen always asks the server: a player who taps
  // it wants to know *now* what changed. The bar shows the progress and the
  // result (or why it failed), so the button itself only starts the sync.
  const onSyncDecks = useCallback(() => {
    if (syncStatus.state === 'syncing') {
      return;
    }

    play('tap');
    void syncDecks({ force: true });
  }, [syncStatus.state]);

  // The hidden admin panel changes the wallet and the collection: Home shows
  // the new numbers right away.
  const onAdminChanged = useCallback(() => {
    void loadWallet();
    void loadDecks();
  }, [loadDecks, loadWallet]);

  // The banner of the update: the app tells the player when a new release is
  // ready.
  useEffect(() => {
    return subscribeToUpdate((release) => {
      setUpdate(release);
    });
  }, []);

  // A release the player already dismissed never shows up again.
  useEffect(() => {
    if (update === null || forcedUpdateRef.current === update.version) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const dismissed = await isUpdateDismissed(update.version);
      if (!cancelled && dismissed) {
        setUpdate(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [update]);

  const forcedUpdateRef = useRef<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const onCheckForUpdates = useCallback(() => {
    if (checkingUpdate) {
      return;
    }
    play('tap');
    setCheckingUpdate(true);
    setUpdateStatus('Checking…');
    void (async () => {
      const found = await runUpdateCheck({ force: true });
      // A version the player asked for shows even if it was dismissed.
      forcedUpdateRef.current = found?.version ?? null;
      const error = lastUpdateError();
      setUpdateStatus(
        found !== null
          ? `v${found.version} is ready — see the banner above.`
          : error !== null
            ? `Could not check: ${error}`
            : `You have the latest version (v${appVersion()}).`,
      );
      setCheckingUpdate(false);
    })();
  }, [checkingUpdate]);

  const onDismissUpdate = useCallback((version: string) => {
    setUpdate(null);
    void dismissUpdate(version);
  }, []);

  // The questions of the section (multiple choice or math), and the decks
  // that hold some. A mixed deck shows up in both sections, each with its
  // own questions; an empty deck stays in the multiple-choice section.
  const allCards = cards;
  const trackCards = useMemo(() => filterByTrack(allCards, track), [allCards, track]);
  const trackSets = useMemo(() => {
    const withTrack = new Set(trackCards.map((card) => card.setId));
    const withAny = new Set(allCards.map((card) => card.setId));
    return sets.filter(
      (set) => withTrack.has(set.id) || (track === 'mc' && !withAny.has(set.id)),
    );
  }, [allCards, sets, track, trackCards]);
  const mathCount = useMemo(() => filterByTrack(allCards, 'math').length, [allCards]);
  // Today's counts of the section (math has its own daily queue).
  const trackDone = studyDay === null ? null : track === 'math' ? studyDay.mathDone : studyDay.done;

  // The chips of the class row, with the number of questions and the number
  // of due questions of every class.
  const chips = useMemo(() => {
    const list = buildClassChips(classes, trackSets, trackCards, cardStates, Date.now());
    if (!mastery || studyDay === null || trackDone === null) {
      return list;
    }
    // Mastery: every class shows today's queue (New / Learning / Due), counted
    // exactly like the big card, so the numbers of the list add up to it.
    const deckClasses = buildDeckClassMap(sets);
    const classOf = new Map(sets.map((set) => [set.id, set.classId]));
    const now = Date.now();
    return list.map((chip) => {
      const scoped =
        chip.kind === 'all'
          ? trackCards
          : filterByScope(trackCards, { kind: 'class', classId: chip.id }, deckClasses);
      return {
        ...chip,
        today: masteryForecast(
          scoped.map((card) => ({ id: card.id, deckId: card.setId, state: cardStates.get(card.id) })),
          { options: studyDay.options, done: trackDone, now, classOf: (id) => classOf.get(id), track },
        ).today,
      };
    });
  }, [cardStates, trackCards, classes, trackSets, mastery, studyDay, trackDone, sets, track]);

  // The decks of the picker, with the number of questions and the number of
  // due questions of every one of them.
  const decks = useMemo(() => {
    const list = buildDecks(trackSets, classes, trackCards, cardStates, Date.now(), filter);
    if (!mastery || studyDay === null || trackDone === null) {
      return list;
    }
    // Mastery: every deck shows today's queue (New / Learn / Due), exactly
    // what a session of the deck would serve within the daily limits.
    const classOf = new Map(sets.map((set) => [set.id, set.classId]));
    const now = Date.now();
    return list.map((deck) => ({
      ...deck,
      today: masteryForecast(
        trackCards
          .filter((card) => card.setId === deck.id)
          .map((card) => ({ id: card.id, deckId: card.setId, state: cardStates.get(card.id) })),
        { options: studyDay.options, done: trackDone, now, classOf: (id) => classOf.get(id), track },
      ).today,
    }));
  }, [cardStates, trackCards, classes, filter, sets, trackSets, mastery, studyDay, trackDone, track]);

  // What the player is about to study: today's queue (Mastery) or the free
  // practice queue, with the numbers the play card shows.
  const plan = useMemo(() => {
    const deckClasses = buildDeckClassMap(sets);
    const cards = trackCards;
    const kind = track === 'math' ? 'math question' : 'question';
    if (cards.length === 0) {
      return {
        line:
          track === 'math'
            ? 'No math questions yet. Import a deck with math questions to start.'
            : 'No questions yet. Import a deck to start studying.',
        today: null,
        empty: true,
      };
    }

    if (mastery && studyDay !== null && trackDone !== null) {
      // Mastery: today's queue of the scope, the way Anki's deck list counts it.
      const classOf = new Map(sets.map((set) => [set.id, set.classId]));
      const today = masteryForecast(
        filterByScope(cards, queueScopeOf(scope), deckClasses).map((card) => ({
          id: card.id,
          deckId: card.setId,
          state: cardStates.get(card.id),
        })),
        { options: studyDay.options, done: trackDone, now: Date.now(), classOf: (id) => classOf.get(id), track },
      ).today;
      return {
        line: '',
        today: { new: today.new, learning: today.learning, due: today.due },
        empty: false,
      };
    }

    const queue = buildQueue(cards, cardStates, Date.now(), {
      newCap: 20,
      scope: queueScopeOf(scope),
      deckClasses,
    });
    const due = countScope(cards, cardStates, Date.now(), queueScopeOf(scope), deckClasses).due;
    return {
      line:
        queue.length === 0
          ? due === 0
            ? 'Nothing queued here yet.'
            : `${due} ${kind}${due === 1 ? '' : 's'} due right now.`
          : `${queue.length} ${kind}${queue.length === 1 ? '' : 's'} ready${due > 0 ? ` · ${due} due` : ''}. Practice never changes your review schedule for cards that are not due.`,
      today: null,
      empty: false,
    };
  }, [cardStates, trackCards, scope, sets, mastery, studyDay, trackDone, track]);

  // The chip of the class row that is selected.
  const selectedChip = useMemo(() => {
    if (scope.kind === 'all') {
      return 'all';
    }
    if (scope.kind === 'class') {
      return scope.id === null ? 'unsorted' : `class:${scope.id}`;
    }
    if (scope.kind === 'set') {
      const deck = decks.find((entry) => entry.id === scope.id);
      if (deck === undefined) {
        return 'all';
      }
      return deck.classId === null ? 'unsorted' : `class:${deck.classId}`;
    }
    return 'all';
  }, [decks, scope]);

  const onSelectChip = useCallback(
    (chip: ClassChip) => {
      if (chip.kind === 'all') {
        setFilter({ kind: 'all' });
        setScope({ kind: 'all' });
        return;
      }
      if (chip.kind === 'unsorted') {
        setFilter({ kind: 'class', classId: null });
        setScope({ kind: 'class', id: null, title: 'Unsorted' });
        return;
      }
      setFilter({ kind: 'class', classId: chip.id });
      setScope(scopeOfChip(chip));
    },
    [setScope],
  );

  const onSelectDeck = useCallback(
    (deck: DeckCard) => {
      setScope(scopeOfDeck(deck));
    },
    [setScope],
  );

  const onCreateClass = useCallback((name: string, color: string) => {
    setCreatingClass(false);

    void (async () => {
      try {
        const store = await openLocalStore();
        const created = await store.createClass(name, color);
        await loadDecks();
        setFilter({ kind: 'class', classId: created.id });
        setScope({ kind: 'class', id: created.id, title: created.name });
      } catch {
        // The class stays as it is.
      }
    })();
  }, [loadDecks, setScope]);

  const onRenameClass = useCallback(
    (name: string) => {
      const chip = editingClass;
      const classId = chip?.id ?? null;
      setEditingClass(null);
      if (chip === null || classId === null) {
        return;
      }

      void (async () => {
        try {
          const store = await openLocalStore();
          await store.renameClass(classId, name);
          await loadDecks();
          if (scope.kind === 'class' && scope.id === classId) {
            setScope({ kind: 'class', id: classId, title: name });
          }
        } catch {
          // The class stays as it is.
        }
      })();
    },
    [editingClass, loadDecks, scope, setScope],
  );

  const onDeleteClass = useCallback(() => {
    const chip = editingClass;
    const classId = chip?.id ?? null;
    setEditingClass(null);
    if (chip === null || classId === null) {
      return;
    }

    void (async () => {
      try {
        const store = await openLocalStore();
        await store.deleteClass(classId);
        await loadDecks();
        if (scope.kind === 'class' && scope.id === classId) {
          setScope({ kind: 'all' });
          setFilter({ kind: 'all' });
        }
      } catch {
        // The class stays as it is.
      }
    })();
  }, [editingClass, loadDecks, scope, setScope]);

  const onMoveDeck = useCallback(
    (classId: string | null) => {
      const deck = movingDeck;
      setMovingDeck(null);
      if (deck === null) {
        return;
      }

      void (async () => {
        try {
          const store = await openLocalStore();
          await store.assignDeckToClass(deck.id, classId);
          await loadDecks();
        } catch {
          // The deck stays where it is.
        }
      })();
    },
    [loadDecks, movingDeck],
  );

  const [dueOnly, setDueOnly] = useState(false);
  const go = useCallback((practice = false) => {
    const useMastery = mastery && !practice;
    const dueParam = dueOnly && !practice ? { due: '1' } : {};
    setScope(scope);
    play('cast');
    router.push({
      pathname: '/fishing',
      params:
        scope.kind === 'all'
          ? { kind: 'all', mastery: useMastery ? '1' : '0', track, ...dueParam }
          : {
              kind: scope.kind,
              id: scope.id ?? '',
              title: scope.title,
              mastery: useMastery ? '1' : '0',
              track,
              ...dueParam,
            },
    });
  }, [router, scope, setScope, mastery, track, dueOnly]);

  const goImport = useCallback(() => {
    play('tap');
    router.push('/import');
  }, [router]);

  // The deck is only gone when the player says so.
  const onConfirmDelete = useCallback(() => {
    const deck = pendingDelete;
    setPendingDelete(null);
    if (deck === null) {
      return;
    }

    void (async () => {
      try {
        const store = await openLocalStore();
        await store.deleteDeck(deck.id);
        if (scope.kind !== 'all' && scope.id === deck.id) {
          setScope({ kind: 'all' });
        }
        await loadDecks();
      } catch {
        // The deck stays where it is.
      }
    })();
  }, [loadDecks, pendingDelete, scope, setScope]);

  return (
    <GameBackground variant="home">
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {update === null ? null : (
            <UpdateBanner update={update} onDismiss={onDismissUpdate} />
          )}

          <View style={styles.header}>
            <Wordmark size={32} />
            <View style={styles.walletPills}>
              <View style={styles.pill} accessibilityLabel={`${balance ?? 0} tokens`}>
                <TokenCounter value={balance ?? 0} size={18} accessibilityLabel={`${balance ?? 0} tokens`} />
              </View>
              {packTickets > 0 ? (
                <View style={styles.pill} accessibilityLabel={`${packTickets} pack tickets`}>
                  <Text style={styles.ticketCount}>🎟️ {packTickets}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <SectionTabs track={track} mathCount={mathCount} onChange={setTrack} />

          <ModeSwitch mastery={mastery} onChange={setMastery} />

          <PlayCard
            track={track}
            mastery={mastery}
            scopeTitle={scopeTitle(scope)}
            line={plan.line}
            today={plan.today}
            empty={plan.empty}
            loading={loading}
            onStart={() => {
              go(false);
            }}
            onPractice={() => {
              go(true);
            }}
            onImport={goImport}
            dueOnly={dueOnly}
            onDueOnly={setDueOnly}
          />

          <StreakCard />

          <ExamPanel />

          <View style={styles.section}>
            <DeckPicker
              chips={chips}
              decks={decks}
              selectedChip={selectedChip}
              selectedDeckId={scope.kind === 'set' ? scope.id : null}
              onSelectChip={onSelectChip}
              onSelectDeck={onSelectDeck}
              onCreateClass={() => {
                play('tap');
                setCreatingClass(true);
              }}
              onEditClass={(chip) => {
                play('tap');
                setEditingClass(chip);
              }}
              onMoveDeck={(deck) => {
                play('tap');
                setMovingDeck(deck);
              }}
              onImport={goImport}
              onDelete={(deck) => {
                play('tap');
                setPendingDelete(deck);
              }}
              onOpenDeck={(deck, deckFilter) => {
                router.push({ pathname: '/deck', params: { id: deck.id, filter: deckFilter, track } });
              }}
            />
          </View>

          <View style={styles.quickRow}>
            <QuickLink
              label="Stats"
              emoji="📊"
              onPress={() => {
                play('tap');
                router.push('/stats');
              }}
            />
            <QuickLink
              label="Limits"
              emoji="🎚️"
              onPress={() => {
                play('tap');
                router.push('/study-options');
              }}
            />
            <QuickLink
              label="Quizzes"
              emoji="📝"
              onPress={() => {
                play('tap');
                router.push('/quiz');
              }}
            />
            <QuickLink
                label={`Packs · ${cheapestPack}🪙`}
                emoji="🎁"
                onPress={() => {
                  router.push('/packs');
                }}
              />
            <QuickLink
                label={`Book ${critterCount}/${totalCritters}`}
                emoji="📖"
                onPress={() => {
                  router.push('/collection');
                }}
              />
            <QuickLink
                label={spinReady ? 'Spin ready!' : 'Spin'}
                emoji="🎡"
                highlight={spinReady}
                onPress={() => {
                  router.push('/spin');
                }}
              />
          </View>

          <View style={styles.section}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: moreOpen }}
              onPress={() => {
                setMoreOpen((open) => !open);
              }}
              style={styles.moreHeader}
            >
              <Text style={styles.sectionTitle}>Settings and more</Text>
              <Text style={styles.moreChevron}>{moreOpen ? '▲' : '▼'}</Text>
            </Pressable>

            {moreOpen ? (
              <>
                <Toggle label="Sound" value={sound} onChange={setSound} />
                <Toggle label="Haptics" value={haptics} onChange={setHaptics} />
                <Toggle
                  label="Reduce motion"
                  value={reduceMotion ?? systemReduceMotion}
                  onChange={(value) => {
                    setReduceMotion(value);
                  }}
                />
                <RemindersSettings />
                <GameButton
                  label={Platform.OS === 'web' ? 'LINK TO PHONE' : 'LINK A BROWSER'}
                  variant="ghost"
                  size="md"
                  onPress={() => {
                    play('tap');
                    router.push('/link');
                  }}
                  accessibilityLabel={Platform.OS === 'web' ? 'Link to phone' : 'Link a browser'}
                />
                <GameButton
                  label={checkingUpdate ? 'CHECKING…' : 'CHECK FOR UPDATES'}
                  variant="secondary"
                  size="md"
                  disabled={checkingUpdate}
                  onPress={onCheckForUpdates}
                  accessibilityLabel="Check for updates"
                />
                {updateStatus === null ? null : (
                  <Text style={styles.versionLabel} accessibilityLiveRegion="polite">
                    {updateStatus}
                  </Text>
                )}
              </>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Version"
              accessibilityHint="Long press to open the hidden admin panel"
              delayLongPress={800}
              onLongPress={() => {
                play('tap');
                setAdminOpen(true);
              }}
              style={styles.versionPressable}
            >
              <Text style={styles.versionLabel}>v{appVersion()}</Text>
            </Pressable>
          </View>
        </ScrollView>

        <SyncBar status={syncStatus} lastSynced={lastSynced} now={clock} onPress={onSyncDecks} />
      </SafeAreaView>

      {pendingDelete === null ? null : (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => {
            setPendingDelete(null);
          }}
        >
          <View style={styles.modalBackdrop}>
            <GlassCard style={styles.modalCard} contentStyle={styles.modalContent} tint={colors.danger}>
              <Text style={styles.modalTitle}>DELETE THIS DECK?</Text>
              <Text style={styles.modalText}>
                “{pendingDelete.title}” and its {pendingDelete.questions} question
                {pendingDelete.questions === 1 ? '' : 's'} leave the game. This cannot be undone.
              </Text>

              <GameButton
                label="KEEP IT"
                variant="ghost"
                size="md"
                onPress={() => {
                  setPendingDelete(null);
                }}
              />
              <GameButton label="DELETE" variant="danger" size="md" onPress={onConfirmDelete} />
            </GlassCard>
          </View>
        </Modal>
      )}

      {creatingClass ? (
        <CreateClassSheet
          onCancel={() => {
            setCreatingClass(false);
          }}
          onCreate={onCreateClass}
        />
      ) : null}

      {editingClass === null ? null : (
        <EditClassSheet
          entry={
            classes.find((entry) => entry.id === editingClass.id) ?? {
              id: editingClass.id ?? '',
              name: editingClass.name,
              color: editingClass.color,
              sort: 0,
              createdAt: 0,
            }
          }
          onCancel={() => {
            setEditingClass(null);
          }}
          onRename={onRenameClass}
          onDelete={onDeleteClass}
        />
      )}

      {movingDeck === null ? null : (
        <MoveDeckSheet
          deckTitle={movingDeck.title}
          classes={classes}
          currentClassId={movingDeck.classId}
          onCancel={() => {
            setMovingDeck(null);
          }}
          onPick={onMoveDeck}
        />
      )}

      <AdminPanel
        visible={adminOpen}
        onClose={() => {
          setAdminOpen(false);
        }}
        onChanged={onAdminChanged}
      />
    </GameBackground>
  );
}

/**
 * The sections of the home screen: multiple choice and Math.
 *
 * Math questions are slow to solve, so they never mix with the multiple
 * choice ones: each section has its own decks and its own daily queue.
 */
function SectionTabs({
  track,
  mathCount,
  onChange,
}: {
  track: QuestionTrack;
  mathCount: number;
  onChange: (track: QuestionTrack) => void;
}) {
  const tabs: { id: QuestionTrack; label: string }[] = [
    { id: 'mc', label: 'QUESTIONS' },
    { id: 'math', label: mathCount > 0 ? `MATH · ${mathCount}` : 'MATH' },
  ];
  return (
    <View style={styles.sectionTabs} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const active = tab.id === track;
        return (
          <Pressable
            key={tab.id}
            testID={`section-tab-${tab.id}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.id === 'math' ? 'Math section' : 'Multiple choice section'}
            onPress={() => {
              if (!active) {
                play('tap');
                onChange(tab.id);
              }
            }}
            style={[styles.sectionTab, active && styles.sectionTabActive]}
          >
            <Text style={[styles.sectionTabText, active && styles.sectionTabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Switch between today's scheduled review and free (endless) practice. */
function ModeSwitch({
  mastery,
  onChange,
}: {
  mastery: boolean;
  onChange: (value: boolean) => void;
}) {
  const options: { value: boolean; label: string }[] = [
    { value: true, label: "TODAY'S REVIEW" },
    { value: false, label: 'FREE PRACTICE' },
  ];
  return (
    <View style={styles.modeBlock}>
      <View style={styles.modeSwitch} accessibilityRole="tablist">
        {options.map((option) => {
          const active = option.value === mastery;
          return (
            <Pressable
              key={option.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => {
                if (!active) {
                  play('tap');
                  onChange(option.value);
                }
              }}
              style={[styles.modeOption, active && styles.modeOptionActive]}
            >
              <Text style={[styles.modeOptionText, active && styles.modeOptionTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.masteryHint}>
        {mastery
          ? 'Scheduled by spaced repetition, with daily limits.'
          : 'Extra practice with no limits. Stop whenever you like.'}
      </Text>
    </View>
  );
}

/**
 * The study card: what is left today (New / Learning / Due), which class or
 * deck it is about, and the one button that starts it. "Due only" plays just
 * the questions that are due or learning, with no new ones.
 */
function PlayCard({
  track,
  mastery,
  scopeTitle: currentScope,
  line,
  today,
  empty,
  loading,
  dueOnly,
  onDueOnly,
  onStart,
  onPractice,
  onImport,
}: {
  track: QuestionTrack;
  mastery: boolean;
  scopeTitle: string;
  line: string;
  today: { new: number; learning: number; due: number } | null;
  empty: boolean;
  loading: boolean;
  dueOnly: boolean;
  onDueOnly: (value: boolean) => void;
  onStart: () => void;
  onPractice: () => void;
  onImport: () => void;
}) {
  const left = today === null ? null : today.new + today.learning + today.due;
  const dueLeft = today === null ? 0 : today.learning + today.due;
  const done = left === 0;
  const prefix = track === 'math' ? 'MATH · ' : '';
  const kicker = empty
    ? `${prefix}GET STARTED`
    : mastery
      ? done
        ? `${prefix}DONE FOR TODAY`
        : `${prefix}TODAY'S REVIEW`
      : `${prefix}FREE PRACTICE`;

  const playing = dueOnly && !done && mastery ? dueLeft : left;
  const buttonLabel = empty
    ? 'IMPORT A DECK'
    : mastery
      ? done
        ? 'PRACTICE (OPTIONAL)'
        : dueOnly
          ? `START ${dueLeft} DUE`
          : 'START REVIEW'
      : 'START PRACTICE';
  const onPress = empty ? onImport : mastery && done ? onPractice : onStart;
  const disabledDue = mastery && !done && dueOnly && dueLeft === 0;

  return (
    <View style={styles.playCard} testID="play-card">
      <Text style={styles.playKicker}>{kicker}</Text>
      <Text style={styles.playScope} numberOfLines={1}>
        {currentScope}
      </Text>

      {loading ? (
        <Text style={styles.playLine}>Loading…</Text>
      ) : today !== null ? (
        <>
          <Text style={styles.playBig}>
            {done ? 'All caught up ✓' : `${playing ?? 0} to do`}
          </Text>
          <View style={styles.counts}>
            <Count label="New" value={today.new} color={colors.primaryLight} dim={dueOnly && mastery} />
            <Count label="Learning" value={today.learning} color={colors.ticket} />
            <Count label="Due" value={today.due} color={colors.gold} />
          </View>
        </>
      ) : (
        <Text style={styles.playLine}>{line}</Text>
      )}

      {mastery && today !== null && !done && !empty ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: dueOnly }}
          accessibilityLabel="Due only: skip the new questions"
          onPress={() => {
            play('tap');
            onDueOnly(!dueOnly);
          }}
          style={styles.dueOnly}
          testID="due-only"
        >
          <View style={[styles.dueBox, dueOnly && styles.dueBoxOn]}>
            {dueOnly ? <Text style={styles.dueCheck}>✓</Text> : null}
          </View>
          <Text style={styles.dueOnlyText}>Due only (skip the new questions)</Text>
        </Pressable>
      ) : null}

      <GameButton
        label={buttonLabel}
        variant={done ? 'secondary' : 'primary'}
        size="lg"
        disabled={disabledDue}
        onPress={onPress}
        pulse={!done && !empty && !disabledDue}
        accessibilityLabel={buttonLabel}
      />

      {done ? (
        <Text style={styles.playLine}>
          Nothing else is scheduled today. Practice is optional and does not affect your reviews.
        </Text>
      ) : null}
    </View>
  );
}

/** One of the three counts of today's queue. */
function Count({ label, value, color, dim = false }: { label: string; value: number; color: string; dim?: boolean }) {
  return (
    <View style={[styles.count, dim ? { opacity: 0.4 } : null]} accessibilityLabel={`${value} ${label}`}>
      <Text style={[styles.countValue, { color }]}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

/**
 * The Sync now bar.
 *
 * It floats low on the home screen so a thumb reaches it, always shows what
 * the last sync did (progress, result or the reason it failed) and is the
 * one button that asks the server for the decks *now*.
 */
function SyncBar({
  status,
  lastSynced,
  now,
  onPress,
}: {
  status: DeckSyncStatus;
  lastSynced: number | null;
  now: number;
  onPress: () => void;
}) {
  const lines = deckSyncLines(status, lastSynced, now);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${lines.title}. ${lines.detail}`}
      accessibilityHint={lines.busy ? undefined : 'Pulls the latest decks from the server'}
      accessibilityState={{ busy: lines.busy, disabled: lines.busy }}
      disabled={lines.busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.syncBar,
        lines.failed ? styles.syncBarFailed : null,
        pressed ? styles.syncBarPressed : null,
      ]}
      testID="sync-now-bar"
    >
      <View style={styles.syncText}>
        <Text
          style={[styles.syncTitle, lines.failed ? styles.syncTitleFailed : null]}
          numberOfLines={1}
        >
          {lines.title}
        </Text>
        <Text style={styles.syncDetail} numberOfLines={lines.failed ? 10 : 2}>
          {lines.detail}
        </Text>
      </View>

      <View
        style={[
          styles.syncAction,
          lines.failed ? styles.syncActionFailed : null,
          lines.busy ? styles.syncActionBusy : null,
        ]}
      >
        {lines.busy ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.syncActionText}>{lines.action}</Text>
        )}
      </View>
    </Pressable>
  );
}

/** A small tappable chip of the secondary links. */
function QuickLink({
  label,
  emoji,
  onPress,
  disabled = false,
  highlight = false,
}: {
  label: string;
  emoji: string;
  onPress: () => void;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickLink,
        highlight && styles.quickLinkHighlight,
        pressed && styles.quickLinkPressed,
        disabled && styles.quickLinkDisabled,
      ]}
    >
      <Text style={styles.quickEmoji}>{emoji}</Text>
      <Text style={styles.quickLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** One of the switches of the settings. */
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => {
        onChange(!value);
      }}
      style={styles.toggleRow}
    >
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={[styles.toggle, value ? styles.toggleOn : styles.toggleOff]}>
        <Text style={styles.toggleText}>{value ? 'on' : 'off'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    // Room for the Sync now bar that floats at the bottom of the screen.
    paddingBottom: 112,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  walletPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pill: {
    borderRadius: radius.chip,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  ticketCount: {
    color: colors.ticket,
    fontFamily: fonts.title,
    fontSize: 16,
  },
  playWrap: {
    position: 'relative',
  },
  playCard: {
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: '#4b3fb8',
    backgroundColor: '#1a1838',
  },
  dueOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 40,
  },
  dueBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dueBoxOn: {
    borderColor: '#7b61ff',
    backgroundColor: '#7b61ff',
  },
  dueCheck: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 14,
    lineHeight: 16,
  },
  dueOnlyText: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
  },
  playGlow: {
    position: 'absolute',
    top: -80,
    right: -60,
  },
  playTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  playText: {
    flex: 1,
    gap: 2,
  },
  playKicker: {
    color: colors.primaryLight,
    fontFamily: fonts.title,
    fontSize: 12,
    letterSpacing: 2.5,
  },
  playScope: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
  },
  playBig: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 28,
    marginTop: 2,
  },
  playLine: {
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    lineHeight: 17,
  },
  playArt: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playImage: {
    width: 64,
    height: 64,
  },
  playEmoji: {
    fontSize: 40,
  },
  counts: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  count: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  countValue: {
    fontFamily: fonts.title,
    fontSize: 22,
  },
  countLabel: {
    color: colors.textDim,
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  modeBlock: {
    gap: spacing.xs,
  },
  modeSwitch: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 999,
  },
  modeOptionActive: {
    backgroundColor: 'rgba(123,97,255,0.35)',
  },
  modeOptionText: {
    color: colors.textDim,
    fontFamily: fonts.title,
    fontSize: 11,
    letterSpacing: 1,
  },
  modeOptionTextActive: {
    color: colors.text,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickLink: {
    flexGrow: 1,
    flexBasis: '30%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    backgroundColor: '#181a22',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickLinkHighlight: {
    borderColor: colors.wheel,
    backgroundColor: 'rgba(255,170,0,0.14)',
  },
  quickLinkPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  quickLinkDisabled: {
    opacity: 0.5,
  },
  quickEmoji: {
    fontSize: 16,
  },
  quickLabel: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  rewardsBlock: {
    gap: spacing.xs,
  },
  moreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
  },
  moreChevron: {
    color: colors.textDim,
    fontSize: 11,
  },
  section: {
    borderRadius: radius.card,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textDim,
    fontFamily: fonts.title,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 42,
  },
  sectionTabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 999,
  },
  sectionTabActive: {
    backgroundColor: colors.primary,
  },
  sectionTabText: {
    color: colors.textDim,
    fontFamily: fonts.title,
    fontSize: 14,
    letterSpacing: 1,
  },
  sectionTabTextActive: {
    color: colors.text,
  },
  masteryHint: {
    paddingHorizontal: spacing.xs,
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    lineHeight: 16,
  },
  syncBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.md,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.card,
    backgroundColor: '#12141a',
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
  },
  syncBarFailed: {
    borderColor: colors.danger,
  },
  syncBarPressed: {
    opacity: 0.85,
  },
  syncText: {
    flex: 1,
    gap: 2,
  },
  syncTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 15,
  },
  syncTitleFailed: {
    color: colors.danger,
  },
  syncDetail: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    lineHeight: 16,
  },
  syncAction: {
    minWidth: 104,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  syncActionFailed: {
    backgroundColor: colors.danger,
  },
  syncActionBusy: {
    backgroundColor: colors.surfaceLight,
  },
  syncActionText: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  versionPressable: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  versionLabel: {
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    letterSpacing: 1,
  },
  toggleLabel: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
  },
  toggle: {
    borderRadius: radius.chip,
    paddingHorizontal: 14,
    paddingVertical: 5,
    minWidth: 56,
    alignItems: 'center',
  },
  toggleOn: {
    backgroundColor: colors.collection,
  },
  toggleOff: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  toggleText: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 5, 8, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.card,
  },
  modalContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 18,
    letterSpacing: 0.5,
  },
  modalText: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    lineHeight: 19,
  },
});
