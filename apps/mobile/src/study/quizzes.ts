import {
  buildQuestionCards,
  localDay,
  parseLocalQuizzes,
  quizQuestionIds,
  type LocalQuiz,
} from '@study-app/core';

import { openLocalStore } from '@/db/local';
import type { QuizDetail } from '@/sync/quizzes';

const QUIZZES_KEY = 'local-quizzes-v1';

/** The quizzes the player made. */
export async function readLocalQuizzes(): Promise<LocalQuiz[]> {
  try {
    const store = await openLocalStore();
    return parseLocalQuizzes(await store.readKv(QUIZZES_KEY));
  } catch {
    return [];
  }
}

async function writeAll(quizzes: readonly LocalQuiz[]): Promise<void> {
  const store = await openLocalStore();
  await store.writeKv(QUIZZES_KEY, JSON.stringify(quizzes));
}

/** Creates a quiz from what the player chose. */
export async function createLocalQuiz(input: {
  title: string;
  deckIds: string[];
  classIds: string[];
  limit: number | null;
  dueDay: string | null;
}): Promise<LocalQuiz> {
  const quiz: LocalQuiz = {
    id: `quiz_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title: input.title.trim() === '' ? 'Quiz' : input.title.trim(),
    deckIds: input.deckIds,
    classIds: input.classIds,
    limit: input.limit,
    dueDay: input.dueDay,
    createdAt: Date.now(),
    results: [],
  };
  await writeAll([...(await readLocalQuizzes()), quiz]);
  return quiz;
}

/** Deletes a quiz. */
export async function deleteLocalQuiz(id: string): Promise<void> {
  await writeAll((await readLocalQuizzes()).filter((quiz) => quiz.id !== id));
}

/** Remembers the score of an attempt. */
export async function recordLocalQuizResult(
  id: string,
  score: number,
  total: number,
): Promise<void> {
  const all = await readLocalQuizzes();
  await writeAll(
    all.map((quiz) =>
      quiz.id === id
        ? { ...quiz, results: [...quiz.results, { day: localDay(new Date()), score, total }].slice(-30) }
        : quiz,
    ),
  );
}

/** The ids of the questions that are on a quiz right now. */
export async function questionIdsOf(quiz: LocalQuiz): Promise<string[]> {
  const store = await openLocalStore();
  const [cards, sets] = await Promise.all([store.listCards(), store.listSets()]);
  const deckClasses = new Map(sets.map((set) => [set.id, set.classId] as const));
  return quizQuestionIds(quiz, cards, deckClasses);
}

/** A quiz ready to play: its questions with their wrong answers. */
export async function buildQuizDetail(quiz: LocalQuiz): Promise<QuizDetail> {
  const ids = await questionIdsOf(quiz);
  const store = await openLocalStore();
  const cards = buildQuestionCards(await store.listCards());
  const byId = new Map(cards.map((card) => [card.id, card] as const));
  const questions = ids.flatMap((id) => {
    const card = byId.get(id);
    return card === undefined
      ? []
      : [{ cardId: card.id, front: card.front, back: card.back, wrong: card.wrong ?? [] }];
  });
  return {
    id: quiz.id,
    title: quiz.title,
    cardIds: questions.map((question) => question.cardId),
    dueAt: null,
    status: 'assigned',
    questions,
  };
}
