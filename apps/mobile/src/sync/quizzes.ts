import type { QuizAnswerPayload } from "@study-app/core";

import type { LocalStore } from "@/db/types";

import { record } from "./outbox";
import { authedRequest, type Result } from "./progressSync";

/** A quiz as the list shows it. */
export interface QuizSummary {
  id: string;
  title: string;
  cardIds: string[];
  dueAt: number | null;
  status: string;
}

/** A quiz with its questions. */
export interface QuizDetail extends QuizSummary {
  questions: { cardId: string; front: string; back: string; wrong: string[] }[];
}

/** The quizzes Muse assigned that are not done yet. */
export async function listAssignedQuizzes(
  fetchImpl?: typeof fetch,
): Promise<Result<QuizSummary[]>> {
  const result = await authedRequest<{ quizzes: QuizSummary[] }>(
    "/api/quizzes?status=assigned",
    { method: "GET" },
    fetchImpl,
  );
  return result.ok ? { ok: true, value: result.value.quizzes } : result;
}

/** One quiz with its questions. */
export function fetchQuiz(
  id: string,
  fetchImpl?: typeof fetch,
): Promise<Result<QuizDetail>> {
  return authedRequest<QuizDetail>(
    `/api/quizzes/${encodeURIComponent(id)}`,
    { method: "GET" },
    fetchImpl,
  );
}

/** Queues one answer as a `quiz_answer` event (the sync pushes it). */
export function recordQuizAnswer(
  store: LocalStore,
  answer: QuizAnswerPayload,
): Promise<void> {
  return record(store, [{ type: "quiz_answer", payload: answer }]);
}
