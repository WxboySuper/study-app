import {
  buildDeckClassMap,
  buildQueue,
  canSpin,
  countScope,
  findCritter,
  isPackAvailable,
  localDayKey,
  MASTERY_REQUIRED_CORRECT,
  PACKS,
  type CardState,
  type StudyCard,
} from '@study-app/core';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdminPanel } from '@/admin/AdminPanel';
import {
  openLocalStore,
  type LocalClass,
  type LocalSet,
} from '@/db/local';
import { critterArt } from '@/packs/critterArt';
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
import { CreateClassSheet, EditClassSheet, MoveDeckSheet } from '@/study/ClassSheets';
import { syncDecks } from '@/sync/syncDecks';
import { colors, fonts, gradientDirection, gradients, radius, shadow, spacing, type Gradient } from '@/theme';
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
  CritterLoader,
  GameBackground,
  GameButton,
  GlassCard,
  Glow,
  ProgressRing,
  TokenCounter,
  WheelGlyph,
  Wordmark,
} from '@/ui';

/**
 * The home screen (SPEC "Session flow").
 *
 * The game shows its face here: the logo, the wallet, the big play card of
 * the fishing mode and the three places of the game (the packs, the book
 * and the wheel). The last scope is remembered, so "Play again" is a single
 * tap.
 */

/** The critter that floats above the play card. */
const HERO_CRITTER_ID = 'mnemo_the_memory_jelly';

/** How long the result of a deck sync stays on the screen. */
const SYNC_TOAST_MS = 2200;

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
  /** `true` while the decks are being pulled from the server. */
  const [syncing, setSyncing] = useState(false);
  /** The result of the last manual sync (a toast). */
  const [syncToast, setSyncToast] = useState<string | null>(null);
  /** `true` while the hidden admin panel is open. */
  const [adminOpen, setAdminOpen] = useState(false);

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

  // The toast of the manual sync goes away by itself.
  useEffect(() => {
    if (syncToast === null) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setSyncToast(null);
    }, SYNC_TOAST_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [syncToast]);

  // The button of the home screen always asks the server: a player who taps
  // it wants to know *now* what changed. A sync that fails (offline) says
  // nothing.
  const onSyncDecks = useCallback(() => {
    if (syncing) {
      return;
    }

    play('tap');
    setSyncing(true);

    void (async () => {
      try {
        const result = await syncDecks({ force: true });
        if (result !== null) {
          setSyncToast(result.message);
          await loadDecks();
        }
      } finally {
        setSyncing(false);
      }
    })();
  }, [loadDecks, syncing]);

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

  // The chips of the class row, with the number of questions and the number
  // of due questions of every class.
  const chips = useMemo(
    () => buildClassChips(classes, sets, cards, cardStates, Date.now()),
    [cardStates, cards, classes, sets],
  );

  // The decks of the picker, with the number of questions and the number of
  // due questions of every one of them.
  const decks = useMemo(
    () => buildDecks(sets, classes, cards, cardStates, Date.now(), filter),
    [cardStates, cards, classes, filter, sets],
  );

  // The line under the play card: what the player is about to study.
  const status = useMemo(() => {
    const deckClasses = buildDeckClassMap(sets);
    const queue = buildQueue(cards, cardStates, Date.now(), {
      newCap: 20,
      scope: queueScopeOf(scope),
      deckClasses,
    });
    const due = countScope(cards, cardStates, Date.now(), queueScopeOf(scope), deckClasses).due;

    if (queue.length === 0) {
      return due === 0
        ? 'No questions yet. Import a deck to start studying.'
        : `${due} question${due === 1 ? '' : 's'} due right now.`;
    }
    return `${queue.length} question${queue.length === 1 ? '' : 's'} queued${
      due > 0 ? ` · ${due} due` : ''
    }.`;
  }, [cardStates, cards, scope, sets]);

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

  const go = useCallback(() => {
    setScope(scope);
    play('cast');
    router.push({
      pathname: '/fishing',
      params:
        scope.kind === 'all'
          ? { kind: 'all', mastery: mastery ? '1' : '0' }
          : {
              kind: scope.kind,
              id: scope.id ?? '',
              title: scope.title,
              mastery: mastery ? '1' : '0',
            },
    });
  }, [router, scope, setScope, mastery]);

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

          <Animated.View style={styles.header}>
            <Wordmark size={44} />
            <Text style={styles.tagline}>
              Endless, untimed study. The scheduler picks the questions, the game picks the vibe.
            </Text>
          </Animated.View>

          <Animated.View
            style={styles.walletRow}
          >
            <GlassCard style={styles.walletCard} contentStyle={styles.walletCardContent} tint={colors.gold}>
              <TokenCounter value={balance ?? 0} size={26} accessibilityLabel={`${balance ?? 0} tokens`} />
              <Text style={styles.walletLabel}>tokens</Text>
            </GlassCard>

            <GlassCard
              style={styles.walletCard}
              contentStyle={styles.walletCardContent}
              tint={colors.ticket}
              accessibilityLabel={`${packTickets} pack tickets`}
            >
              <Text style={styles.ticketEmoji}>🎟️</Text>
              <Text style={styles.ticketCount}>{packTickets}</Text>
              <Text style={styles.walletLabel}>tickets</Text>
            </GlassCard>
          </Animated.View>

          <Animated.View
          >
            <PlayCard
              onPress={go}
              scopeTitle={scopeTitle(scope)}
              status={status}
              loading={loading}
            />
          </Animated.View>

          <Animated.View style={styles.masteryRow}>
            <Toggle label="MASTERY MODE" value={mastery} onChange={setMastery} />
            <Text style={styles.masteryHint}>
              {mastery
                ? `Every question needs ${MASTERY_REQUIRED_CORRECT} right answers in a row. A miss starts it over.`
                : 'Endless play: the cards that are due come first.'}
            </Text>
          </Animated.View>

          <Animated.View style={styles.syncCard}>
            <View style={styles.syncText}>
              <Text style={styles.syncTitle}>SYNC DECKS</Text>
              <Text style={styles.syncHint}>Pull the latest questions from your class.</Text>
            </View>
            <GameButton
              label={syncing ? 'SYNCING…' : 'SYNC'}
              variant="collection"
              size="md"
              disabled={syncing}
              onPress={onSyncDecks}
              accessibilityLabel="Sync decks"
              accessibilityHint="Pulls the latest decks from the server"
            />
          </Animated.View>

          <Animated.View style={styles.tiles}>
            <ModeTile
              title="PACKS"
              hint="Open a pack"
              gradient={gradients.shop}
              glow={colors.shop}
              onPress={() => {
                router.push('/packs');
              }}
              badge={`FROM ${cheapestPack} 🪙`}
              art={<PacksArt />}
            />

            <ModeTile
              title="COLLECTION"
              hint="Sell duplicates"
              gradient={gradients.collection}
              glow={colors.collection}
              onPress={() => {
                router.push('/collection');
              }}
              badge={`${critterCount}/${totalCritters}`}
              art={
                <ProgressRing progress={totalCritters === 0 ? 0 : critterCount / totalCritters} size={58} color={colors.collection}>
                  <Text style={styles.ringText}>{critterCount}</Text>
                </ProgressRing>
              }
            />

            <ModeTile
              title="DAILY SPIN"
              hint="Free tokens"
              gradient={gradients.wheel}
              glow={colors.wheel}
              onPress={() => {
                router.push('/spin');
              }}
              badge={spinReady ? 'SPIN READY!' : 'COME BACK TOMORROW'}
              badgePulse={spinReady}
              art={<WheelGlyph size={54} />}
            />
          </Animated.View>

          <Animated.View style={styles.section}>
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
                router.push({ pathname: '/deck', params: { id: deck.id, filter: deckFilter } });
              }}
            />
          </Animated.View>

          <Animated.View style={styles.section}>
            <Text style={styles.sectionTitle}>Settings</Text>
            <Toggle label="Sound" value={sound} onChange={setSound} />
            <Toggle label="Haptics" value={haptics} onChange={setHaptics} />
            <Toggle
              label="Reduce motion"
              value={reduceMotion ?? systemReduceMotion}
              onChange={(value) => {
                setReduceMotion(value);
              }}
            />

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
          </Animated.View>
        </ScrollView>

        {syncToast === null ? null : (
          <Animated.View
            entering={FadeIn}
            exiting={FadeOut}
            style={styles.syncToast}
            pointerEvents="none"
          >
            <Text style={styles.syncToastText}>{syncToast}</Text>
          </Animated.View>
        )}
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

/** The big play card of the fishing mode. */
function PlayCard({
  onPress,
  scopeTitle: currentScope,
  status,
  loading,
}: {
  onPress: () => void;
  scopeTitle: string;
  status: string;
  loading: boolean;
}) {
  const bob = useSharedValue(0);
  const critter = findCritter(HERO_CRITTER_ID);
  const art = critter === undefined ? null : critterArt(critter);

  useEffect(() => {
    bob.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(bob);
    };
  }, [bob]);

  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -10 + bob.value * 20 }, { rotate: `${(bob.value - 0.5) * 5}deg` }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play Fish Frenzy. ${currentScope}`}
      accessibilityHint="Starts a study session"
      onPress={onPress}
      style={({ pressed }) => [styles.playPressable, pressed && styles.playPressed]}
    >
      <View style={styles.playWrap}>
        <Glow color={colors.primary} size={300} opacity={0.55} style={styles.playGlow} />

        <GlassCard contentStyle={styles.playCard} tint="#7b61ff">
          <View style={styles.playTop}>
            <View style={styles.playText}>
              <Text style={styles.playKicker}>PLAY</Text>
              <Text style={styles.playTitle}>Fish Frenzy</Text>
              <Text style={styles.playScope}>{currentScope}</Text>
            </View>

            <Animated.View style={[styles.playArt, bobStyle]}>
              {art === null ? (
                <Text style={styles.playEmoji}>{critter?.emoji ?? '🐟'}</Text>
              ) : (
                <Image source={art} style={styles.playImage} resizeMode="contain" />
              )}
            </Animated.View>
          </View>

          <GameButton label="START" variant="primary" size="lg" onPress={onPress} pulse />

          {loading ? (
            <CritterLoader art={art} emoji={critter?.emoji ?? '🐟'} label="Waking the critters…" />
          ) : (
            <Text style={styles.playStatus}>{status}</Text>
          )}
        </GlassCard>
      </View>
    </Pressable>
  );
}

/** The art of the packs tile: the critters of the starter pack. */
function PacksArt() {
  const critter = findCritter('gigabrain_golem');
  const art = critter === undefined ? null : critterArt(critter);

  if (art === null) {
    return <Text style={styles.playEmoji}>🎁</Text>;
  }

  return <Image source={art} style={styles.tileImage} resizeMode="contain" />;
}

/** One of the three tiles of the game. */
function ModeTile({
  title,
  hint,
  gradient,
  glow,
  onPress,
  badge,
  badgePulse = false,
  art,
}: {
  title: string;
  hint: string;
  gradient: Gradient;
  glow: string;
  onPress: () => void;
  badge: string;
  badgePulse?: boolean;
  art: ReactNode;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!badgePulse) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return undefined;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(pulse);
    };
  }, [badgePulse, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + pulse.value * 0.45,
    transform: [{ scale: 1 + pulse.value * 0.06 }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${hint}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tilePressable, pressed && styles.tilePressed]}
    >
      <View style={styles.tile}>
        <LinearGradientFace colors={gradient} />
        <Glow color={glow} size={150} opacity={0.45} style={styles.tileGlow} />

        <View style={styles.tileArt}>{art}</View>

        <Text style={styles.tileTitle}>{title}</Text>
        <Text style={styles.tileHint}>{hint}</Text>

        <Animated.View style={[styles.badge, pulseStyle]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

/** The gradient face of a tile. */
function LinearGradientFace({ colors }: { colors: Gradient }) {
  return (
    <LinearGradient
      colors={colors}
      start={gradientDirection.start}
      end={gradientDirection.end}
      style={StyleSheet.absoluteFill}
    />
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
    paddingBottom: 48,
    gap: spacing.lg,
  },
  header: {
    alignItems: 'center',
    gap: 4,
    paddingTop: spacing.sm,
  },
  tagline: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  walletRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  walletCard: {
    flex: 1,
  },
  walletCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  walletLabel: {
    color: colors.textDim,
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  ticketEmoji: {
    fontSize: 20,
  },
  ticketCount: {
    color: colors.ticket,
    fontFamily: fonts.title,
    fontSize: 24,
  },
  playPressable: {
    borderRadius: radius.card,
  },
  playPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  playWrap: {
    position: 'relative',
  },
  playCard: {
    padding: spacing.lg,
    gap: spacing.md,
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
    fontSize: 13,
    letterSpacing: 3,
  },
  playTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 30,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
  playScope: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
  },
  playArt: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playImage: {
    width: 96,
    height: 96,
  },
  playEmoji: {
    fontSize: 56,
  },
  playStatus: {
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    textAlign: 'center',
  },
  tiles: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  tilePressable: {
    flex: 1,
  },
  tilePressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  tile: {
    flex: 1,
    minHeight: 168,
    borderRadius: radius.tile,
    padding: spacing.md,
    alignItems: 'center',
    gap: 2,
    overflow: 'hidden',
    ...shadow.soft,
  },
  tileGlow: {
    position: 'absolute',
    top: -40,
    left: -30,
  },
  tileArt: {
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileImage: {
    width: 64,
    height: 64,
  },
  tileTitle: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 13,
    letterSpacing: 0.8,
    marginTop: spacing.xs,
  },
  tileHint: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: fonts.bodySemi,
    fontSize: 11,
  },
  badge: {
    marginTop: spacing.sm,
    borderRadius: radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  badgeText: {
    color: '#ffffff',
    fontFamily: fonts.title,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  ringText: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 16,
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
  masteryRow: {
    gap: 2,
    paddingHorizontal: spacing.xs,
  },
  masteryHint: {
    color: colors.textDim,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    lineHeight: 16,
  },
  syncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.card,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  syncText: {
    flex: 1,
    gap: 2,
  },
  syncTitle: {
    color: colors.textDim,
    fontFamily: fonts.title,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  syncHint: {
    color: colors.textMuted,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    lineHeight: 16,
  },
  syncToast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    borderRadius: radius.button,
    backgroundColor: 'rgba(18, 20, 26, 0.96)',
    borderWidth: 1,
    borderColor: colors.collection,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  syncToastText: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 14,
    textAlign: 'center',
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
