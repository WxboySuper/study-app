export { computeStudyStats, type StudyStats } from './stats';
export {
  DEFAULT_AUTO_RATING_THRESHOLDS,
  autoRating,
  type AutoRatingInput,
  type AutoRatingThresholds,
} from './rating';

export {
  DEFAULT_BONUS_LIMIT,
  DEFAULT_BONUS_STABILITY_THRESHOLD,
  buildQueue,
  countScope,
  filterByScope,
  type DeckClassMap,
  type QueueItem,
  type QueueItemKind,
  type QueueOptions,
  type QueueScope,
  type ScopeCount,
  type StateLookup,
} from './queue';

export {
  buildDeckClassMap,
  decksOfClass,
  type ClassDeck,
} from './classes';

export {
  compareSemver,
  isNewerVersion,
  parseSemver,
  type SemVer,
} from './version';

export { parseRelease, type ReleaseInfo } from './release';

export {
  ADMIN_TOKEN_GRANT,
  applyTokenAdminAction,
  type TokenAdminAction,
} from './admin';

export {
  parseSyncSnapshot,
  planDeckSync,
  type LocalSyncClass,
  type LocalSyncDeck,
  type LocalSyncQuestion,
  type LocalSyncState,
  type PlannedClass,
  type PlannedDeck,
  type PlannedQuestion,
  type RemoteSyncDeck,
  type RemoteSyncQuestion,
  type RemoteSyncSnapshot,
  type SyncPlan,
  type SyncPlanOptions,
} from './sync';

export {
  DEFAULT_CORRECT_REINSERT_MAX,
  DEFAULT_CORRECT_REINSERT_MIN,
  DEFAULT_REINSERT_MAX,
  DEFAULT_REINSERT_MIN,
  DEFAULT_WEAK_STABILITY,
  MASTERY_MIN_GAP,
  MASTERY_REQUIRED_CORRECT,
  answerSessionQuestion,
  createSessionQueue,
  masteredCount,
  masteryCounts,
  masteryProgress,
  nextSessionQuestion,
  sessionComplete,
  sessionRemaining,
  sessionTotal,
  updateSessionStates,
  type MasteryProgress,
  type MasteryRecord,
  type SessionMode,
  type SessionQuestion,
  type SessionQueueOptions,
  type SessionQueueState,
} from './sessionQueue';

export {
  DEFAULT_ANKI_SETTINGS,
  Intersperser,
  LearningSteps,
  Rating as AnkiRating,
  ankiCardFromState,
  answerAnkiCard,
  buildAnkiQueues,
  burySiblings,
  fsrsIntervalDays,
  learningGapQuestions,
  pickNextAnki,
  removeAnkiCard,
  requeueAnkiCard,
  reviewGapQuestions,
  siblingIds,
  type AnkiAnswerContext,
  type AnkiAnswerResult,
  type AnkiCard,
  type AnkiPick,
  type AnkiPickGroup,
  type AnkiQueue,
  type AnkiQueues,
  type AnkiRecord,
  type AnkiSettings,
} from './anki';

export {
  hasMath,
  mathSources,
  plainText,
  splitMathSegments,
  type MathSegment,
  type MathSegmentType,
} from './math';

export {
  createInitialState,
  fromFsrsCard,
  fromFsrsLog,
  grade,
  toFsrsCard,
  type GradeOptions,
  type GradeResult,
} from './scheduler';

export {
  DEFAULT_PAYOUT_RULES,
  computePayout,
  type Payout,
  type PayoutInput,
  type PayoutRules,
} from './payout';

export {
  toEpochMs,
  type CardState,
  type ReviewLogRecord,
  type StudyCard,
} from './types';

export {
  MAX_IMPORT_CARDS,
  parseDeck,
  type DeckCounts,
  type DeckFormat,
  type ImportCard,
  type ParsedDeck,
} from './import';

export {
  MAX_OPTIONS,
  MAX_WRONG_ANSWERS,
  MIN_OPTIONS,
  buildChoices,
  buildQuestionCards,
  isPlayable,
  normalizeWrongAnswers,
  type BuiltChoices,
  type ChoiceCard,
} from './choices';

export {
  CRITTER_PACKS,
  CRITTER_RARITIES,
  CRITTER_RARITY_ODDS,
  CRITTERS,
  FISHES,
  HALLOWEEN_PACK_ID,
  HEAVY,
  JUNK,
  POWERUPS,
  SPECIALS,
  STARTER_PACK_ID,
  contentTypeOf,
  isAvailable,
  isWithinWindow,
  windowOf,
  type AvailabilityWindow,
  type ContentSeason,
  type ContentType,
  type CritterDef,
  type CritterPackDef,
  type CritterRarity,
  type FishDef,
  type HeavyDef,
  type JunkDef,
  type PackKind,
  type PowerupDef,
  type PowerupId,
  type SpecialDef,
  type SpecialKind,
  type TimedEntry,
} from './content';

export {
  crittersByRarity,
  crittersOfPack,
  findCritter,
  findPack,
  isPackAvailable,
} from './critters';

export {
  PACKS,
  buyPack,
  canOpenPack,
  findPackDef,
  openPack,
  packRarityOdds,
  type BuyPackOptions,
  type CanOpenPackOptions,
  type PackAffordability,
  type PackDef,
  type PackPurchaseError,
  type PackPurchaseFailure,
  type PackPurchaseResult,
  type PackPurchaseSuccess,
} from './packs';

export {
  CRITTER_SELL_VALUES,
  TOKEN_STEP,
  collectionEntry,
  collectionProgress,
  critterSellValue,
  isTokenMultiple,
  sellAllDuplicates,
  sellDuplicate,
  type Collection,
  type CollectionEntry,
  type CollectionProgress,
  type SellAllResult,
  type SellResult,
} from './collection';

export {
  SPIN_JACKPOT,
  SPIN_SEGMENTS,
  SPIN_TOTAL_WEIGHT,
  applySpinReward,
  canSpin,
  findSpinSegment,
  spinDailyWheel,
  spinSegmentAtRotation,
  spinSegmentIndex,
  spinTargetRotation,
  SPIN_SEGMENT_DEG,
  SPIN_EDGE_MARGIN_DEG,
  type SpinSegment,
} from './spin';

export {
  CATCHES,
  CATCH_TIER_ORDER,
  CATCH_TIERS,
  CRITTER_TIER,
  LEGEND_MAX_SHARE,
  SPECIAL_COLOR,
  WIKI_ROW_COUNT,
  catchOddsForRank,
  catchPool,
  catchesForRank,
  catchesOfTier,
  findCatch,
  findCritterCatch,
  formatLbs,
  isCatchAvailable,
  tierDefinition,
  type CatchDef,
  type CatchOdds,
  type CatchPoolOptions,
  type CatchTier,
  type CatchTierDef,
  type FishingSeason,
} from './fishing/catches';

export {
  HEAVY_WIKI_ROWS,
  MAX_ROLL_RANK,
  TIER_LURE_RANKS,
  WIKI_TABLE,
  WIKI_TIER_TO_CATCH_TIER,
  clampRollRank,
  isTierAvailableAt,
  wikiRowByName,
  wikiRowForIndex,
  wikiRowsOfTier,
  wikiTierWeight,
  wikiTiersForRank,
  type WikiRow,
  type WikiTier,
} from './fishing/wiki';

export {
  BAIT_EFFECTS,
  EMPTY_BAITS,
  LURE_RANKS,
  LURE_SHOP_ITEMS,
  MAX_LURE_RANK,
  baitsFromIds,
  equippedBaitEffect,
  findLureShopItem,
  lureRankName,
  lureShopItemsOfKind,
  type BaitEffect,
  type BaitId,
  type EquippedBaits,
  type LureItemKind,
  type LureRank,
  type LureRankDef,
  type LureShopItem,
} from './fishing/lures';

export {
  BASE_SPECIAL_ODDS,
  FRENZY_CATCHES,
  FRENZY_RANK_BONUS,
  FRENZY_WEIGHT_MULTIPLIER,
  LURE_GUARANTEE_THRESHOLDS,
  SPECIAL_SHARE_BY_RANK,
  TIER_ODDS,
  baseTierOdds,
  createRandomRng,
  createRollState,
  createSeededRng,
  findPowerup,
  applyLureUpgrade,
  applySpecialReward,
  lurePaceFor,
  ENDLESS_LURE_PACE,
  guaranteedLureCount,
  isCatchOutcome,
  pickWeightedCatch,
  rollCatch,
  rollCritter,
  rollTier,
  rollWeight,
  specialOddsFor,
  tierOddsForRank,
  toOutcome,
  weightMultiplier,
  type CatchOutcome,
  type Rng,
  type RollOptions,
  type RollResult,
  type RollState,
  type RolledCatch,
  type SpecialOdds,
  type TierOdds,
} from './fishing/roll';

export {
  FISH_LOST_MS,
  WRONG_LOCKOUT_MS,
  biggestCatch,
  createFishingState,
  fishingReducer,
  leadUpOf,
  masteryStatusOf,
  remainingCards,
  toSessionResult,
  LEAD_UP_FULL_MS,
  LEAD_UP_SHORT_MS,
  type CaughtCatch,
  type CritterCatchRecord,
  type FishingEvent,
  type FishingFeedback,
  type FishingLeadUp,
  type FishingMachineOptions,
  type FishingPhase,
  type FishingQuestion,
  type FishingReview,
  type FishingSession,
  type FishingSessionResult,
  type FishingState,
  type MasteryStatus,
} from './fishing/machine';

export type { Card, Grade, ReviewLog, State } from 'ts-fsrs';

export {
  MAX_PACK_TICKETS_PER_DAY,
  MAX_PACK_TICKETS_PER_SESSION,
  NOOP_WALLET_SYNC,
  countStudyProgress,
  emptyWallet,
  localDayKey,
  rollWalletDay,
  settleSession,
  type SessionOutcome,
  type SessionReviewLike,
  type Settlement,
  type StudyProgress,
  type WalletSnapshot,
  type WalletSync,
} from './wallet';
export {
  buildQuestionRows,
  countQuestionFilters,
  formatDueIn,
  matchesQuestionFilter,
  parseQuestionFilter,
  questionStatus,
  QUESTION_FILTERS,
  type QuestionFilter,
  type QuestionRow,
  type QuestionStatusKind,
  matchesQuestionSearch,
  sortQuestionRows,
  QUESTION_SORTS,
  type QuestionSort,
} from './deckDetail';
export {
  appendOutbox,
  dropFromOutbox,
  foldRemoteEvents,
  makeEvent,
  outboxSize,
  OUTBOX_MAX,
  peekOutbox,
  SYNCED_KV_KEYS,
  walletDelta,
  applyWalletChanges,
  mergeCardStates,
  type BaselinePayload,
  type ProgressEvent,
  type ProgressEventType,
  type ProgressPayloads,
  type RemoteChanges,
  type RemoteEvent,
  type WalletDeltaPayload,
} from './progressSync';

export {
  DEFAULT_DAILY_LIMITS,
  DEFAULT_LEECH_THRESHOLD,
  DEFAULT_MEDIAN_ANSWER_MS,
  MATURE_STABILITY_DAYS,
  gradeByAnswerTime,
  gradeLabel,
  isLeech,
  isMatureMastered,
  medianAnswerMs,
  remainingToday,
  type DailyLimits,
} from './mastery';

export type { QuizAnswerPayload } from './progressSync';

export * from './studyOptions';
export {
  MASTERY_EPOCH,
  dropStaleOutbox,
  isSchedulingEvent,
  isStaleSchedulingEvent,
  needsMasteryReset,
} from './progressSync';
export * from './reviewHistory';
export * from './mathQuestion';
