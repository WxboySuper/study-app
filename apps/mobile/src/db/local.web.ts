import {
  applySpinReward,
  applyTokenAdminAction,
  buyPack,
  createInitialState,
  createRandomRng,
  findPackDef,
  rollWalletDay,
  sellAllDuplicates,
  sellDuplicate,
  settleSession,
  spinDailyWheel,
  type CardState,
  type ImportCard,
  type LocalSyncState,
  type StudyCard,
  type SyncPlan,
  type WalletSnapshot,
} from '@study-app/core';

import type {
  DailySpin,
  ImportDeckResult,
  LocalClass,
  LocalSet,
  LocalStore,
  LocalTopic,
  OpenPackOptions,
  OpenPackResult,
  PendingReview,
  SellAllDuplicatesResult,
  SellDuplicatesResult,
  SpinResult,
} from './types';

export type { LocalClass, LocalSet, LocalTopic, PendingReview } from './types';

/**
 * The local store of the web build.
 *
 * The phone keeps its data in SQLite; the browser has no such thing, so the
 * web build swaps the store for this in-memory mock. It is seeded with a
 * demo player (a few tokens, a pack ticket, half a collection with
 * duplicates and a stack of study cards), so every screen of the game can be
 * opened, played and reviewed in a browser.
 *
 * The rules are not re-implemented here: the pure functions of
 * `@study-app/core` (`buyPack`, `sellDuplicate`, `sellAllDuplicates`,
 * `spinDailyWheel`, `settleSession`) do the work, exactly like they do in
 * the SQLite store.
 */

/** The state of the demo player. */
interface DemoState {
  wallet: WalletSnapshot;
  collection: Map<string, number>;
  cards: StudyCard[];
  /** The remote id of every card that came from the server. */
  cardRemoteIds: Map<string, string>;
  cardStates: Map<string, CardState>;
  sets: LocalSet[];
  topics: LocalTopic[];
  classes: LocalClass[];
  /** The small key/value store of the app. */
  kv: Map<string, string>;
  /** The reward of every spin, by local day. */
  spins: Map<string, number>;
  /** The reviews that wait for the server. */
  outbox: PendingReview[];
  /** The sessions that were already paid out. */
  settled: Set<string>;
}

/** The topics of the demo player. */
const DEMO_TOPICS: LocalTopic[] = [
  { id: 'topic_biology', name: 'Biology', color: '#34d399' },
  { id: 'topic_history', name: 'History', color: '#f472b6' },
  { id: 'topic_physics', name: 'Physics', color: '#38bdf8' },
];

/** The classes of the demo player. */
const DEMO_CLASSES: LocalClass[] = [
  { id: 'class_science', name: 'Science', color: '#22d3ee', sort: 1, createdAt: 0 },
  { id: 'class_humanities', name: 'Humanities', color: '#f472b6', sort: 2, createdAt: 0 },
];

/** The sets of the demo player. */
const DEMO_SETS: LocalSet[] = [
  {
    id: 'set_cells',
    topicId: 'topic_biology',
    title: 'Cell biology',
    classId: 'class_science',
  },
  {
    id: 'set_revolution',
    topicId: 'topic_history',
    title: 'Industrial revolution',
    classId: 'class_humanities',
  },
  {
    id: 'set_meteorology',
    topicId: 'topic_physics',
    title: 'Meteorology',
    classId: 'class_science',
  },
];

/**
 * The study cards of the demo player.
 *
 * Every card carries its own three wrong answers, the way Blooket does it:
 * the questions never borrow the answers of the other cards.
 *
 * The last cards of the deck show what the game does with math: the LaTeX
 * of a question or of an answer (`$...$` and `$$...$$`), the escaped dollar
 * sign of a price and the long answers, which are never cut off.
 *
 * The LaTeX is written with doubled backslashes, because TypeScript would
 * read a single one as an escape (`\f` is a form feed, `\n` a newline).
 */
const DEMO_CARDS: StudyCard[] = [
  {
    id: 'card_cell_1',
    setId: 'set_cells',
    topicId: 'topic_biology',
    type: 'mc',
    front: 'Which organelle is the powerhouse of the cell?',
    back: 'The mitochondrion',
    wrong: ['The ribosome', 'The lysosome', 'The Golgi apparatus'],
  },
  {
    id: 'card_cell_2',
    setId: 'set_cells',
    topicId: 'topic_biology',
    type: 'mc',
    front: 'What is the fluid inside a cell called?',
    back: 'Cytoplasm',
    wrong: ['Cytosol', 'Nucleoplasm', 'Cerebrospinal fluid'],
  },
  {
    id: 'card_cell_3',
    setId: 'set_cells',
    topicId: 'topic_biology',
    type: 'mc',
    front: 'Which structure gives a plant cell its green colour?',
    back: 'The chloroplast',
    wrong: ['The cell wall', 'The vacuole', 'The mitochondrion'],
  },
  {
    id: 'card_cell_4',
    setId: 'set_cells',
    topicId: 'topic_biology',
    type: 'mc',
    front: 'What surrounds the nucleus of an animal cell?',
    back: 'The nuclear membrane',
    wrong: ['The cell membrane', 'The nuclear pore', 'The cytoskeleton'],
  },
  {
    id: 'card_cell_5',
    setId: 'set_cells',
    topicId: 'topic_biology',
    type: 'mc',
    front: 'Which molecule carries the genetic instructions?',
    back: 'DNA',
    wrong: ['RNA', 'ATP', 'The chromosome'],
  },
  {
    id: 'card_rev_1',
    setId: 'set_revolution',
    topicId: 'topic_history',
    type: 'mc',
    front: 'In which year did the Industrial Revolution begin in Britain?',
    back: 'Around 1760',
    wrong: ['Around 1820', 'Around 1680', 'Around 1900'],
  },
  {
    id: 'card_rev_2',
    setId: 'set_revolution',
    topicId: 'topic_history',
    type: 'mc',
    front: 'What powered the first factories?',
    back: 'The steam engine',
    wrong: ['The water wheel', 'The electric motor', 'The diesel engine'],
  },
  {
    id: 'card_rev_3',
    setId: 'set_revolution',
    topicId: 'topic_history',
    type: 'mc',
    front: 'Which industry grew first in the industrial cities?',
    back: 'Textiles',
    wrong: ['Shipbuilding', 'The steel industry', 'Railways'],
  },
  {
    id: 'card_rev_4',
    setId: 'set_revolution',
    topicId: 'topic_history',
    type: 'mc',
    front: 'Who wrote "The Wealth of Nations"?',
    back: 'Adam Smith',
    wrong: ['Karl Marx', 'David Ricardo', 'Robert Malthus'],
  },
  {
    id: 'card_rev_5',
    setId: 'set_revolution',
    topicId: 'topic_history',
    type: 'mc',
    front: 'What invention moved goods along the new railways?',
    back: 'The steam locomotive',
    wrong: ['The steam ship', 'The steam carriage', 'The steam hammer'],
  },
  {
    id: 'card_math_1',
    setId: 'set_meteorology',
    topicId: 'topic_physics',
    type: 'mc',
    front: 'How does the temperature of a fluid change over time?',
    back: '$\\frac{dT}{dt} = \\frac{\\partial T}{\\partial t} + \\vec{V}\\cdot\\nabla T$',
    wrong: [
      '$\\frac{dT}{dt} = \\frac{\\partial T}{\\partial t}$',
      '$\\frac{dT}{dt} = \\vec{V}\\cdot\\nabla T$',
      '$\\frac{dT}{dt} = \\frac{\\partial T}{\\partial t} + \\vec{V}\\cdot\\nabla^2 T$',
    ],
  },
  {
    id: 'card_long_1',
    setId: 'set_meteorology',
    topicId: 'topic_physics',
    type: 'mc',
    front: 'What does the diffusion term of the heat equation stand for?',
    back: 'Diffusion term representing molecular heat conduction',
    wrong: [
      'Advection term representing the transport of heat by the wind',
      'Radiation term representing the heat lost to the atmosphere',
      'Pressure term representing the weight of the overlying air',
    ],
  },
  {
    id: 'card_math_2',
    setId: 'set_meteorology',
    topicId: 'topic_physics',
    type: 'mc',
    front: 'What does the symbol $\\nabla$ stand for?',
    back: 'The nabla operator, also called the gradient or del operator',
    wrong: [
      'The Laplacian operator, also called the divergence or curl',
      'The divergence operator, also called the gradient or curl',
      'The gradient of a vector field, also called the nabla or curl operator',
    ],
  },
  {
    id: 'card_math_3',
    setId: 'set_meteorology',
    topicId: 'topic_physics',
    type: 'mc',
    front: 'Which equation gives the pressure of an ideal gas?',
    back: '$$PV = nRT$$',
    wrong: ['$$P = nRTV$$', '$$PV = nRT^2$$', '$$PV^2 = nRT$$'],
  },
  {
    id: 'card_math_4',
    setId: 'set_meteorology',
    topicId: 'topic_physics',
    type: 'mc',
    front: 'What does the school charge to rent a weather station for a day?',
    back: 'It costs \\$5 per day',
    wrong: ['It costs \\$15 per day', 'It costs \\$5 per week', 'It costs \\$50 per day'],
  },
];

/**
 * The deck of the long-note screenshot.
 *
 * The web build can seed a 65 question deck of long math questions
 * (`?demo=layout`), so the fishing screen can be photographed with a full
 * mastery bar and a note that fills the width of a phone. Every prompt and
 * every answer carries LaTeX: the picture checks the padding of the
 * parchment, the wrapping of long formulas and the scrolling of the note.
 */
const LAYOUT_DECK_ID = 'set_layout_65';

const LAYOUT_CARDS: StudyCard[] = Array.from({ length: 65 }, (_, index) => {
  const n = index + 1;
  const front =
    index % 3 === 0
      ? `Solve the differential equation $\\frac{d^2y}{dx^2} + ${n}\\,\\frac{dy}{dx} + ${n + 1}y = \\sin(${n}x)$ for $y(x)$ when $x > 0$ and $y(0) = ${n}$.`
      : index % 3 === 1
        ? `Which expression gives the value of $\\int_{0}^{${n}} \\left( ${n}x^2 + \\frac{1}{x + 1} \\right) dx$ for $x > -1$?`
        : `Simplify $\\frac{${n}x^2 + ${n + 2}x + 1}{x + 1} + \\sqrt{${n * n}x^2 + ${n}x + 1}$ for $x \\ge 0$.`;

  const answer =
    index % 3 === 0
      ? `$y = e^{-${n}x/2}\\left(A\\cos(\\omega x) + B\\sin(\\omega x)\\right) + \\frac{${n}}{${n + 1}}\\sin(${n}x)$`
      : index % 3 === 1
        ? `$\\frac{${n}}{3}${n}^3 + \\ln(${n} + 1) - \\ln(1) = \\frac{${n}^4}{3} + \\ln(${n} + 1)$`
        : `$${n}x + 1 + ${n}x\\sqrt{x^2 + 1} + \\frac{${n}}{2}\\ln\\left(x + \\sqrt{x^2 + 1}\\right)$$`;

  return {
    id: `${LAYOUT_DECK_ID}_card_${n}`,
    setId: LAYOUT_DECK_ID,
    topicId: 'topic_physics',
    type: 'mc',
    front,
    back: answer,
    wrong: [
      answer.replace(`${n}`, `${n + 1}`),
      answer.replace('\\sin', '\\cos').replace('\\ln', '\\log'),
      answer.replace('$', '$ - '),
    ],
  };
});

/**
 * The collection of the demo player.
 *
 * Half of the starter pack, with a few duplicates that can be sold: the
 * collection screen has something to show and something to sell.
 */
const DEMO_COLLECTION: Readonly<Record<string, number>> = {
  nibbles_the_notecard: 3,
  pip_pencil: 2,
  doodle_moth: 1,
  sir_highlighter: 4,
  gummy_eraser: 1,
  captain_cram: 2,
  recall_raccoon: 1,
  synapse_sprite: 1,
  mnemo_the_memory_jelly: 2,
  the_spaced_ranger: 1,
  candy_corn_kid: 1,
};

/** The state of a card that was already reviewed (`State.Review` of ts-fsrs). */
const REVIEW_STATE = 2;

/**
 * The scheduling states of the demo player.
 *
 * Some cards are due (the picker of the home screen shows them with their
 * "due" badge), some are not due yet and the rest are new.
 */
function demoCardStates(): Map<string, CardState> {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const states = new Map<string, CardState>();

  const state = (cardId: string, due: number, stability: number): CardState => ({
    cardId,
    due,
    stability,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 2,
    lapses: 0,
    state: REVIEW_STATE,
    lastReview: now - day,
  });

  for (const id of [
    'card_cell_1',
    'card_cell_3',
    'card_cell_5',
    'card_rev_1',
    'card_rev_3',
    'card_math_1',
    'card_math_3',
  ]) {
    states.set(id, state(id, now - day, 3));
  }
  for (const id of ['card_cell_2', 'card_rev_2', 'card_rev_5']) {
    states.set(id, state(id, now + day, 12));
  }

  return states;
}

/** Creates the state of the demo player. */
function createDemoState(layoutDeck = false): DemoState {
  const sets = layoutDeck
    ? [
        ...DEMO_SETS,
        {
          id: LAYOUT_DECK_ID,
          topicId: 'topic_physics',
          title: 'Calculus warm-up (65)',
          classId: 'class_science',
        },
      ]
    : DEMO_SETS;

  return {
    wallet: {
      balance: 150,
      day: '',
      tokensToday: 0,
      packTicketsToday: 0,
      packTickets: 1,
    },
    collection: new Map(Object.entries(DEMO_COLLECTION)),
    cards: layoutDeck ? [...DEMO_CARDS, ...LAYOUT_CARDS] : DEMO_CARDS,
    cardRemoteIds: new Map(),
    cardStates: demoCardStates(),
    sets,
    topics: DEMO_TOPICS,
    classes: DEMO_CLASSES,
    kv: new Map(),
    spins: new Map(),
    outbox: [],
    settled: new Set(),
  };
}

/** The state of the demo player (one per page load). */
let state: DemoState | null = null;

/** The state of the demo player, created on the first use. */
function demo(): DemoState {
  if (state === null) {
    const search = (globalThis as { location?: { search?: string } }).location?.search ?? '';
    // The screenshot of the long note asks for the 65 question math deck
    // (`?demo=layout`); every other page gets the small demo player.
    state = createDemoState(search.includes('demo=layout'));

    // The demo of the web build can also show a player who cannot afford a
    // pack (`?poor=1`): the shop then refuses to open another one.
    if (search.includes('poor=1')) {
      state.wallet.balance = 5;
      state.wallet.packTickets = 0;
    }
  }
  return state;
}

/** Opens the local store of the web build. */
export async function openLocalStore(): Promise<LocalStore> {
  return {
    listCards: async () => [...demo().cards],
    listCardStates: async () => new Map(demo().cardStates),
    listSets: async () => [...demo().sets],
    listTopics: async () => [...demo().topics],
    listClasses: async () => [...demo().classes],
    createClass: async (name, color) => createClassOfDemo(name, color),
    renameClass: async (id, name) => {
      demo().classes = demo().classes.map((entry) =>
        entry.id === id ? { ...entry, name: name.trim() } : entry,
      );
    },
    deleteClass: async (id) => {
      const current = demo();
      current.classes = current.classes.filter((entry) => entry.id !== id);
      // The decks of the class are never deleted: they go back to the
      // "Unsorted" bucket.
      current.sets = current.sets.map((set) =>
        set.classId === id ? { ...set, classId: null } : set,
      );
    },
    assignDeckToClass: async (setId, classId) => {
      demo().sets = demo().sets.map((set) => (set.id === setId ? { ...set, classId } : set));
    },
    importDeck: async (name, cards, classId) => importDeckOfDemo(name, cards, classId),
    deleteDeck: async (setId) => deleteDeckOfDemo(setId),
    upsertCardState: async (cardState) => {
      demo().cardStates.set(cardState.cardId, cardState);
    },
    enqueueReview: async (review) => {
      demo().outbox.push(review);
    },
    readSyncState: async () => readSyncStateOfDemo(),
    applySyncPlan: async (plan) => applySyncPlanOfDemo(plan),
    readKv: async (key) => demo().kv.get(key) ?? null,
    writeKv: async (key, value) => {
      demo().kv.set(key, value);
    },
    readWallet: async (today) => {
      const current = demo();
      current.wallet = rollWalletDay(current.wallet, today);
      return current.wallet;
    },
    readCollection: async () => new Map(demo().collection),
    settleSession: async (sessionId, mode, outcome, today, now, sync) => {
      const current = demo();
      if (current.settled.has(sessionId)) {
        return null;
      }
      current.settled.add(sessionId);

      // A session pays the wallet, it never grants a critter: the collection
      // only changes when a pack is opened.
      const settlement = settleSession(current.wallet, outcome, today);
      current.wallet = settlement.wallet;
      void now;
      void mode;

      if (sync !== undefined) {
        try {
          await sync.pushSettlement(sessionId, settlement);
        } catch {
          // Offline first: the session stays unsynced.
        }
      }

      return settlement;
    },
    readLastSpin: async (): Promise<DailySpin | null> => {
      const current = demo();
      const days = [...current.spins.keys()].sort();
      const last = days[days.length - 1];
      if (last === undefined) {
        return null;
      }
      return { localDate: last, reward: current.spins.get(last) ?? 0 };
    },
    buyAndOpenPack: async (packId, options) => openPackOfDemo(packId, options),
    sellDuplicates: async (critterId, qty) => sellDuplicatesOfDemo(critterId, qty),
    sellAllDuplicates: async () => sellAllDuplicatesOfDemo(),
    spinDailyWheel: async (today, options) => spinOfDemo(today, options),
    clearCollection: async () => {
      demo().collection = new Map();
    },
    resetTokens: async () => {
      const current = demo();
      current.wallet = applyTokenAdminAction(current.wallet, 'reset');
    },
    addTokens: async (amount) => {
      const current = demo();
      current.wallet = applyTokenAdminAction(current.wallet, 'grant', amount);
    },
    resetSpinCooldown: async () => {
      demo().spins = new Map();
    },
  };
}

/**
 * Creates a class in the demo store.
 *
 * The new class goes to the end of the picker, like in the SQLite store.
 */
async function createClassOfDemo(name: string, color?: string | null): Promise<LocalClass> {
  const current = demo();
  const sort = current.classes.reduce((highest, entry) => Math.max(highest, entry.sort), 0) + 1;
  const created: LocalClass = {
    id: `class_${Date.now().toString(36)}_${Math.floor(Math.random() * 1_000_000).toString(36)}`,
    name: name.trim(),
    color: color ?? null,
    sort,
    createdAt: Date.now(),
  };

  current.classes = [...current.classes, created];
  return created;
}

/**
 * Imports a deck into the demo store.
 *
 * The web build has no transactions, but the rules are the same as the ones
 * of the SQLite store: a new set, its cards and their fresh scheduling state.
 */
async function importDeckOfDemo(
  name: string,
  cards: readonly ImportCard[],
  classId: string | null = null,
): Promise<ImportDeckResult> {
  const current = demo();
  const title = name.trim();

  if (title === '') {
    return { ok: false, setId: null, topicId: null, classId: null, cards: 0, message: 'The deck needs a name.' };
  }

  if (cards.length === 0) {
    return { ok: false, setId: null, topicId: null, classId: null, cards: 0, message: 'The deck has no questions.' };
  }

  const setId = `set_import_${Date.now().toString(36)}_${Math.floor(
    Math.random() * 1_000_000,
  ).toString(36)}`;
  const now = Date.now();

  current.sets = [...current.sets, { id: setId, topicId: null, classId, title }];

  for (const [index, card] of cards.entries()) {
    const cardId = `${setId}_card_${index + 1}`;
    current.cards = [
      ...current.cards,
      {
        id: cardId,
        setId,
        topicId: null,
        type: 'mc',
        front: card.front,
        back: card.back,
        wrong: [...card.wrong],
      },
    ];
    current.cardStates.set(cardId, createInitialState(cardId, new Date(now)));
  }

  return { ok: true, setId, topicId: null, classId, cards: cards.length, message: null };
}

/** Reads the state that the merge of the server decks needs. */
async function readSyncStateOfDemo(): Promise<LocalSyncState> {
  const current = demo();
  return {
    classes: current.classes.map((entry) => ({ id: entry.id, name: entry.name })),
    decks: current.sets.map((entry) => ({
      id: entry.id,
      remoteId: entry.remoteId ?? null,
      title: entry.title,
    })),
    questions: current.cards.map((entry) => ({
      id: entry.id,
      remoteId: current.cardRemoteIds.get(entry.id) ?? null,
      setId: entry.setId,
    })),
  };
}

/**
 * Applies the plan of a server sync to the demo store.
 *
 * The rules are the same as the ones of the SQLite store: the classes are
 * created first, then the decks and their questions are upserted, and the
 * rows that left the server are dropped. A question that is already there
 * keeps its scheduling state.
 */
async function applySyncPlanOfDemo(plan: SyncPlan): Promise<void> {
  const current = demo();
  const now = Date.now();
  let sort = current.classes.reduce((highest, entry) => Math.max(highest, entry.sort), 0) + 1;

  for (const entry of plan.classes) {
    current.classes = [
      ...current.classes,
      { id: entry.id, name: entry.name, color: null, sort, createdAt: now },
    ];
    sort += 1;
  }

  for (const deck of plan.decks) {
    const known = current.sets.some((entry) => entry.id === deck.localId);

    if (known) {
      current.sets = current.sets.map((entry) =>
        entry.id === deck.localId
          ? { ...entry, title: deck.title, classId: deck.classId, remoteId: deck.remoteId }
          : entry,
      );
    } else {
      current.sets = [
        ...current.sets,
        {
          id: deck.localId,
          topicId: null,
          classId: deck.classId,
          title: deck.title,
          remoteId: deck.remoteId,
        },
      ];
    }

    for (const question of deck.questions) {
      current.cardRemoteIds.set(question.localId, question.remoteId);

      if (question.created) {
        current.cards = [
          ...current.cards,
          {
            id: question.localId,
            setId: deck.localId,
            topicId: null,
            type: 'mc',
            front: question.question,
            back: question.correct,
            wrong: [...question.wrong],
          },
        ];
        current.cardStates.set(
          question.localId,
          createInitialState(question.localId, new Date(now)),
        );
      } else {
        current.cards = current.cards.map((card) =>
          card.id === question.localId
            ? {
                ...card,
                setId: deck.localId,
                front: question.question,
                back: question.correct,
                wrong: [...question.wrong],
              }
            : card,
        );
      }
    }

    for (const questionId of deck.removedQuestionIds) {
      removeCardOfDemo(current, questionId);
    }
  }

  for (const deckId of plan.deletedDeckIds) {
    const cardIds = current.cards
      .filter((card) => card.setId === deckId)
      .map((card) => card.id);

    current.sets = current.sets.filter((entry) => entry.id !== deckId);
    for (const cardId of cardIds) {
      removeCardOfDemo(current, cardId);
    }
  }
}

/** Removes a card with its state and its pending review from the demo store. */
function removeCardOfDemo(current: DemoState, cardId: string): void {
  current.cards = current.cards.filter((card) => card.id !== cardId);
  current.cardRemoteIds.delete(cardId);
  current.cardStates.delete(cardId);
  current.outbox = current.outbox.filter((review) => review.cardId !== cardId);
}

/** Deletes a deck (with its cards, states and pending reviews) in the demo store. */
async function deleteDeckOfDemo(setId: string): Promise<void> {
  const current = demo();
  const cardIds = new Set(
    current.cards.filter((card) => card.setId === setId).map((card) => card.id),
  );

  current.sets = current.sets.filter((set) => set.id !== setId);
  current.cards = current.cards.filter((card) => card.setId !== setId);
  current.outbox = current.outbox.filter((review) => !cardIds.has(review.cardId));

  for (const cardId of cardIds) {
    current.cardStates.delete(cardId);
    current.cardRemoteIds.delete(cardId);
  }
}

/** Buys a pack and opens it in the demo store. */
async function openPackOfDemo(
  packId: string,
  options: OpenPackOptions = {},
): Promise<OpenPackResult> {
  const current = demo();
  const pack = findPackDef(packId);
  if (pack === undefined) {
    return { ok: false, error: 'unknown_pack', message: 'This pack does not exist.' };
  }

  const purchase = buyPack(current.wallet, pack, options.now ?? Date.now(), {
    useTicket: options.useTicket,
    rng: options.rng ?? createRandomRng(),
  });

  if (!purchase.ok) {
    return { ok: false, error: purchase.error, message: purchase.message };
  }

  const duplicate = (current.collection.get(purchase.critterId) ?? 0) > 0;
  current.wallet = purchase.wallet;
  current.collection.set(purchase.critterId, (current.collection.get(purchase.critterId) ?? 0) + 1);

  return {
    ok: true,
    wallet: purchase.wallet,
    critterId: purchase.critterId,
    duplicate,
    paidTokens: purchase.paidTokens,
    usedTicket: purchase.usedTicket,
  };
}

/** Sells the duplicates of one critter in the demo store. */
async function sellDuplicatesOfDemo(critterId: string, qty: number): Promise<SellDuplicatesResult> {
  const current = demo();
  const sale = sellDuplicate(current.collection, critterId, qty);

  if (sale.sold <= 0) {
    return {
      ok: false,
      error: current.collection.has(critterId) ? 'nothing_to_sell' : 'unknown_critter',
      message: current.collection.has(critterId)
        ? 'You only have one copy, and the last copy is never sold.'
        : 'You do not own this critter.',
      wallet: current.wallet,
    };
  }

  current.collection = sale.collection;
  current.wallet = { ...current.wallet, balance: current.wallet.balance + sale.tokens };

  return {
    ok: true,
    wallet: current.wallet,
    tokens: sale.tokens,
    sold: sale.sold,
  };
}

/** Sells every duplicate of the demo store. */
async function sellAllDuplicatesOfDemo(): Promise<SellAllDuplicatesResult> {
  const current = demo();
  const sale = sellAllDuplicates(current.collection);

  if (sale.tokens <= 0) {
    return {
      ok: false,
      error: 'nothing_to_sell',
      message: 'You do not have any duplicate yet.',
      wallet: current.wallet,
    };
  }

  current.collection = sale.collection;
  current.wallet = { ...current.wallet, balance: current.wallet.balance + sale.tokens };

  const sold = [...sale.sold.values()].reduce((sum, count) => sum + count, 0);
  return { ok: true, wallet: current.wallet, tokens: sale.tokens, sold };
}

/** Spins the wheel of the demo store (once per local day). */
async function spinOfDemo(
  today: string,
  options: { rng?: ReturnType<typeof createRandomRng>; now?: number } = {},
): Promise<SpinResult> {
  const current = demo();

  if (current.spins.has(today)) {
    return {
      ok: false,
      error: 'already_spun',
      message: 'You already spun the wheel today.',
      wallet: current.wallet,
    };
  }

  const reward = spinDailyWheel(options.rng ?? createRandomRng());
  current.spins.set(today, reward);
  current.wallet = applySpinReward(current.wallet, reward);

  return { ok: true, reward, wallet: current.wallet };
}
