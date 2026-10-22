import type { Context } from "hono";

import { hasMuseToken } from "./auth";
import type { AuthedDevice, WireEvent } from "./progress";
import type { Bindings } from "./types";

/**
 * Quizzes (docs/API.md §Quizzes).
 *
 * Muse assigns a quiz: a fixed, seeded pick of questions from one deck or
 * one class. The device plays it and writes each answer as a `quiz_answer`
 * event through `/sync/push`; the push stores it in `quiz_answers`, and a
 * quiz whose every question is answered becomes `completed`.
 */

type Ctx = Context<{ Bindings: Bindings }>;

/** The most questions one quiz can have. */
export const QUIZ_MAX_COUNT = 100;

/** The status of a quiz. */
export type QuizStatus = "assigned" | "completed" | "withdrawn";

interface QuizRow {
  id: string;
  title: string;
  deck_id: string | null;
  class_id: string | null;
  card_ids_json: string;
  seed: number;
  due_at: number | null;
  created_at: number;
  status: QuizStatus;
  started_at: number | null;
  completed_at: number | null;
}

/** `true` when the request carries the Muse token. */
export function isMuseRequest(c: Ctx): boolean {
  return hasMuseToken(c.req.header("authorization"), c.env?.MUSE_TOKEN);
}

/** A small seeded random source (mulberry32). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks `count` ids from the pool (the whole pool when it is smaller), seeded. */
export function pickQuizCards(
  pool: readonly string[],
  count: number,
  seed: number,
): string[] {
  const copy = [...pool];
  const random = seededRandom(seed);
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other] as string, copy[index] as string];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

function text(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Reads a due date (ISO text or epoch ms); `undefined` when it is invalid. */
function readDueAt(value: unknown): number | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }
  const at =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Date.parse(value)
        : Number.NaN;
  return Number.isFinite(at) && at > 0 ? Math.floor(at) : undefined;
}

function view(row: QuizRow) {
  return {
    id: row.id,
    title: row.title,
    ...(row.deck_id !== null
      ? { deckId: row.deck_id }
      : { classId: row.class_id }),
    cardIds: JSON.parse(row.card_ids_json) as string[],
    seed: row.seed,
    dueAt: row.due_at,
    createdAt: row.created_at,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function newQuizId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `qz_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function readBody(c: Ctx): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json();
    return body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** `POST /api/quizzes` (Muse) - assigns a quiz. */
export async function createQuiz(c: Ctx): Promise<Response> {
  const body = await readBody(c);
  if (body === null) {
    return c.json({ error: "bad_request" }, 400);
  }
  const deckId = text(body.deckId);
  const classId = text(body.classId);
  if ((deckId === null) === (classId === null)) {
    return c.json(
      { error: "bad_request", detail: "exactly one of deckId or classId" },
      400,
    );
  }
  const count = body.count;
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > QUIZ_MAX_COUNT
  ) {
    return c.json(
      { error: "bad_request", detail: `count must be 1-${QUIZ_MAX_COUNT}` },
      400,
    );
  }
  const dueAt = readDueAt(body.dueAt);
  if (dueAt === undefined) {
    return c.json({ error: "bad_request", detail: "invalid dueAt" }, 400);
  }

  const pool = await c.env.DB.prepare(
    deckId !== null
      ? `SELECT q.id FROM questions q JOIN decks d ON d.id = q.deck_id
         WHERE d.id = ? AND d.deleted = 0 ORDER BY q.position, q.id`
      : `SELECT q.id FROM questions q JOIN decks d ON d.id = q.deck_id
         WHERE d.class_name = ? AND d.deleted = 0 ORDER BY d.id, q.position, q.id`,
  )
    .bind(deckId ?? classId)
    .all<{ id: string }>();
  const ids = (pool.results ?? []).map((row) => row.id);
  if (ids.length === 0) {
    return c.json({ error: "empty_pool" }, 404);
  }

  const seedBytes = new Uint32Array(1);
  crypto.getRandomValues(seedBytes);
  const seed = (seedBytes[0] as number) >>> 1;
  const cardIds = pickQuizCards(ids, count, seed);
  const row: QuizRow = {
    id: newQuizId(),
    title: text(body.title) ?? "Quiz",
    deck_id: deckId,
    class_id: classId,
    card_ids_json: JSON.stringify(cardIds),
    seed,
    due_at: dueAt,
    created_at: Date.now(),
    status: "assigned",
    started_at: null,
    completed_at: null,
  };
  await c.env.DB.prepare(
    `INSERT INTO quizzes (id, title, deck_id, class_id, card_ids_json, seed, due_at, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'assigned')`,
  )
    .bind(
      row.id,
      row.title,
      row.deck_id,
      row.class_id,
      row.card_ids_json,
      row.seed,
      row.due_at,
      row.created_at,
    )
    .run();
  return c.json(view(row), 201);
}

/** `GET /api/quizzes?status=` (Muse or device) - newest first. */
export async function listQuizzes(c: Ctx): Promise<Response> {
  const status = c.req.query("status") ?? "all";
  if (!["assigned", "completed", "all"].includes(status)) {
    return c.json({ error: "bad_request" }, 400);
  }
  const rows = await c.env.DB.prepare(
    status === "all"
      ? "SELECT * FROM quizzes WHERE status != 'withdrawn' ORDER BY created_at DESC, id DESC"
      : "SELECT * FROM quizzes WHERE status = ? ORDER BY created_at DESC, id DESC",
  )
    .bind(...(status === "all" ? [] : [status]))
    .all<QuizRow>();
  return c.json({ quizzes: (rows.results ?? []).map(view) });
}

async function readQuiz(c: Ctx, id: string): Promise<QuizRow | null> {
  return c.env.DB.prepare("SELECT * FROM quizzes WHERE id = ?")
    .bind(id)
    .first<QuizRow>();
}

/** `GET /api/quizzes/:id` (Muse or device) - the quiz with its questions. */
export async function getQuiz(c: Ctx, id: string): Promise<Response> {
  const row = await readQuiz(c, id);
  if (row === null || row.status === "withdrawn") {
    return c.json({ error: "not_found" }, 404);
  }
  const quiz = view(row);
  const found = await questionsById(c, quiz.cardIds);
  const questions = quiz.cardIds
    .map((cardId) => found.get(cardId))
    .filter((q): q is QuestionRow => q !== undefined)
    .map((q) => ({
      cardId: q.id,
      front: q.question,
      back: q.correct,
      wrong: JSON.parse(q.wrong_json) as string[],
    }));
  return c.json({ ...quiz, questions });
}

interface QuestionRow {
  id: string;
  question: string;
  correct: string;
  wrong_json: string;
}

async function questionsById(
  c: Ctx,
  ids: readonly string[],
): Promise<Map<string, QuestionRow>> {
  const map = new Map<string, QuestionRow>();
  if (ids.length === 0) {
    return map;
  }
  const rows = await c.env.DB.prepare(
    `SELECT id, question, correct, wrong_json FROM questions WHERE id IN (${ids.map(() => "?").join(",")})`,
  )
    .bind(...ids)
    .all<QuestionRow>();
  for (const row of rows.results ?? []) {
    map.set(row.id, row);
  }
  return map;
}

/** `GET /api/quizzes/:id/results` (Muse). */
export async function quizResults(c: Ctx, id: string): Promise<Response> {
  const row = await readQuiz(c, id);
  if (row === null) {
    return c.json({ error: "not_found" }, 404);
  }
  const quiz = view(row);
  const answers = await c.env.DB.prepare(
    "SELECT card_id, chosen, correct, time_ms, answered_at FROM quiz_answers WHERE quiz_id = ?",
  )
    .bind(id)
    .all<{
      card_id: string;
      chosen: string;
      correct: number;
      time_ms: number;
      answered_at: number;
    }>();
  const byCard = new Map((answers.results ?? []).map((a) => [a.card_id, a]));
  const found = await questionsById(c, quiz.cardIds);
  const list = quiz.cardIds
    .filter((cardId) => byCard.has(cardId))
    .map((cardId) => {
      const a = byCard.get(cardId)!;
      const q = found.get(cardId);
      return {
        cardId,
        prompt: q?.question ?? null,
        correctAnswer: q?.correct ?? null,
        chosenAnswer: a.chosen,
        correct: a.correct === 1,
        timeMs: a.time_ms,
        answeredAt: a.answered_at,
      };
    });
  return c.json({
    id: quiz.id,
    title: quiz.title,
    status: quiz.status,
    startedAt: quiz.startedAt,
    completedAt: quiz.completedAt,
    score: {
      correct: list.filter((a) => a.correct).length,
      total: quiz.cardIds.length,
    },
    answers: list,
  });
}

/** `DELETE /api/quizzes/:id` (Muse) - withdraws an assigned quiz. */
export async function withdrawQuiz(c: Ctx, id: string): Promise<Response> {
  const result = await c.env.DB.prepare(
    "UPDATE quizzes SET status = 'withdrawn' WHERE id = ? AND status = 'assigned'",
  )
    .bind(id)
    .run();
  if ((result.meta?.changes ?? 0) === 0) {
    const row = await readQuiz(c, id);
    return row === null
      ? c.json({ error: "not_found" }, 404)
      : c.json({ error: "not_assigned", status: row.status }, 409);
  }
  return c.json({ ok: true as const, id });
}

/** The payload of a `quiz_answer` event; `null` when it is malformed. */
export function parseQuizAnswer(
  payload: unknown,
): {
  quizId: string;
  cardId: string;
  chosen: string;
  correct: boolean;
  timeMs: number;
  answeredAt: number;
} | null {
  if (payload === null || typeof payload !== "object") {
    return null;
  }
  const p = payload as Record<string, unknown>;
  if (
    typeof p.quizId !== "string" ||
    typeof p.cardId !== "string" ||
    typeof p.chosen !== "string"
  ) {
    return null;
  }
  if (typeof p.correct !== "boolean") {
    return null;
  }
  const timeMs =
    typeof p.timeMs === "number" && Number.isFinite(p.timeMs) && p.timeMs >= 0
      ? Math.floor(p.timeMs)
      : 0;
  const answeredAt =
    typeof p.answeredAt === "number" &&
    Number.isFinite(p.answeredAt) &&
    p.answeredAt > 0
      ? Math.floor(p.answeredAt)
      : null;
  if (answeredAt === null) {
    return null;
  }
  return {
    quizId: p.quizId,
    cardId: p.cardId,
    chosen: p.chosen,
    correct: p.correct,
    timeMs,
    answeredAt,
  };
}

/**
 * Stores the `quiz_answer` events of a push. Unknown or withdrawn quizzes and
 * cards that are not in the quiz are ignored (the event itself is still kept
 * in the log). The first answer of a card wins.
 */
export async function recordQuizAnswers(
  db: D1Database,
  device: AuthedDevice,
  events: readonly WireEvent[],
): Promise<void> {
  const touched = new Set<string>();
  for (const event of events) {
    if (event.type !== "quiz_answer") {
      continue;
    }
    const answer = parseQuizAnswer(event.payload);
    if (answer === null) {
      continue;
    }
    const quiz = await db
      .prepare("SELECT * FROM quizzes WHERE id = ?")
      .bind(answer.quizId)
      .first<QuizRow>();
    if (quiz === null || quiz.status === "withdrawn") {
      continue;
    }
    const cardIds = JSON.parse(quiz.card_ids_json) as string[];
    if (!cardIds.includes(answer.cardId)) {
      continue;
    }
    await db
      .prepare(
        `INSERT INTO quiz_answers (quiz_id, card_id, player_id, chosen, correct, time_ms, answered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(quiz_id, card_id) DO NOTHING`,
      )
      .bind(
        answer.quizId,
        answer.cardId,
        device.playerId,
        answer.chosen,
        answer.correct ? 1 : 0,
        answer.timeMs,
        answer.answeredAt,
      )
      .run();
    await db
      .prepare(
        "UPDATE quizzes SET started_at = MIN(COALESCE(started_at, ?), ?) WHERE id = ?",
      )
      .bind(answer.answeredAt, answer.answeredAt, answer.quizId)
      .run();
    touched.add(answer.quizId);
  }
  for (const quizId of touched) {
    await db
      .prepare(
        `UPDATE quizzes SET status = 'completed',
           completed_at = (SELECT MAX(answered_at) FROM quiz_answers WHERE quiz_id = quizzes.id)
         WHERE id = ? AND status = 'assigned'
           AND (SELECT COUNT(*) FROM quiz_answers WHERE quiz_id = quizzes.id) >= json_array_length(card_ids_json)`,
      )
      .bind(quizId)
      .run();
  }
}
