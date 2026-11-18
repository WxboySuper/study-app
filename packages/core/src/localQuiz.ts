/**
 * Quizzes the player makes in the app.
 *
 * A quiz names what will be on it: whole decks, whole classes, or both, with
 * an optional question limit and a due day. The questions are picked from the
 * library when the quiz starts (a fixed pick for a given quiz, so "study for
 * this quiz" and the quiz itself use the same questions).
 */

/** A quiz of the player. */
export interface LocalQuiz {
  id: string;
  title: string;
  /** Decks that are on the quiz. */
  deckIds: string[];
  /** Classes that are on the quiz (every deck of the class). */
  classIds: string[];
  /** The most questions on the quiz (`null` means all of them). */
  limit: number | null;
  /** The day the quiz is due, `YYYY-MM-DD` (`null` means no date). */
  dueDay: string | null;
  createdAt: number;
  /** The scores of the attempts, newest last. */
  results: QuizResult[];
}

/** One attempt. */
export interface QuizResult {
  day: string;
  score: number;
  total: number;
}

/** The quiz limits the builder offers. */
export const QUIZ_LIMITS: readonly (number | null)[] = [10, 20, 30, null];

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Reads the saved quizzes; anything broken is dropped. */
export function parseLocalQuizzes(raw: string | null): LocalQuiz[] {
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const out: LocalQuiz[] = [];
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue;
      const q = item as Partial<LocalQuiz>;
      if (typeof q.id !== 'string' || typeof q.title !== 'string') continue;
      out.push({
        id: q.id,
        title: q.title,
        deckIds: strings(q.deckIds),
        classIds: strings(q.classIds),
        limit: typeof q.limit === 'number' && q.limit > 0 ? Math.floor(q.limit) : null,
        dueDay: typeof q.dueDay === 'string' && DAY.test(q.dueDay) ? q.dueDay : null,
        createdAt: typeof q.createdAt === 'number' ? q.createdAt : 0,
        results: Array.isArray(q.results)
          ? q.results.filter(
              (r): r is QuizResult =>
                typeof r === 'object' &&
                r !== null &&
                typeof (r as QuizResult).day === 'string' &&
                Number.isFinite((r as QuizResult).score) &&
                Number.isFinite((r as QuizResult).total),
            )
          : [],
      });
    }
    return out;
  } catch {
    return [];
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** A deterministic hash of a text (the seed of a quiz). */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The questions that are on a quiz.
 *
 * Every question of the chosen decks and classes, shuffled with the quiz id as
 * the seed, cut to the limit. The same quiz over the same library always
 * gives the same questions in the same order.
 *
 * @param cards The questions of the library (`id` and the deck they are in).
 * @param deckClasses The class of every deck (`null` for none).
 */
export function quizQuestionIds(
  quiz: Pick<LocalQuiz, 'id' | 'deckIds' | 'classIds' | 'limit'>,
  cards: readonly { id: string; setId: string }[],
  deckClasses: ReadonlyMap<string, string | null>,
): string[] {
  const decks = new Set(quiz.deckIds);
  const classes = new Set(quiz.classIds);
  const picked = cards
    .filter((card) => {
      if (decks.has(card.setId)) return true;
      const classId = deckClasses.get(card.setId);
      return classId !== null && classId !== undefined && classes.has(classId);
    })
    .map((card) => card.id)
    .sort();

  const rng = mulberry32(hash(quiz.id));
  for (let i = picked.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [picked[i], picked[j]] = [picked[j]!, picked[i]!];
  }
  return quiz.limit === null ? picked : picked.slice(0, quiz.limit);
}

/** "Due in 3 days", "Due today", "Overdue" or "No due date". */
export function quizDueLabel(dueDay: string | null, today: string): string {
  if (dueDay === null) return 'No due date';
  const days = Math.round(
    (Date.parse(`${dueDay}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000,
  );
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

/** The best score of a quiz as a percentage (`null` before the first attempt). */
export function bestQuizPercent(results: readonly QuizResult[]): number | null {
  let best: number | null = null;
  for (const result of results) {
    if (result.total <= 0) continue;
    const percent = Math.round((result.score / result.total) * 100);
    if (best === null || percent > best) best = percent;
  }
  return best;
}
