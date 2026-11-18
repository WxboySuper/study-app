import { readiness, type ExamPlan, type Readiness } from '@study-app/core';

import { openLocalStore } from '@/db/local';

const EXAMS_KEY = 'exam-plans';

/** Reads the saved exam date for each class. */
export async function readExams(): Promise<ExamPlan[]> {
  const store = await openLocalStore();
  const raw = await store.readKv(EXAMS_KEY);
  if (raw === null) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isExamPlan);
  } catch {
    return [];
  }
}

/** Saves or replaces the exam date for a class. */
export async function saveExam(classId: string, date: string): Promise<void> {
  const exams = await readExams();
  const next = exams.filter((exam) => exam.classId !== classId);
  next.push({ classId, date });
  const store = await openLocalStore();
  await store.writeKv(EXAMS_KEY, JSON.stringify(next));
}

/** Removes the saved exam date for a class. */
export async function clearExam(classId: string): Promise<void> {
  const exams = await readExams();
  const next = exams.filter((exam) => exam.classId !== classId);
  const store = await openLocalStore();
  if (next.length === 0) {
    await store.writeKv(EXAMS_KEY, '[]');
  } else {
    await store.writeKv(EXAMS_KEY, JSON.stringify(next));
  }
}

/** Reads readiness for the active cards in one class. */
export async function readClassReadiness(
  classId: string,
  now: Date = new Date(),
): Promise<Readiness> {
  const store = await openLocalStore();
  const [sets, cards, states] = await Promise.all([
    store.listSets(),
    store.listCards(),
    store.listCardStates(),
  ]);
  const deckIds = new Set(sets.filter((set) => set.classId === classId).map((set) => set.id));
  return readiness(
    cards
      .filter((card) => deckIds.has(card.setId))
      .map((card) => ({
        id: card.id,
        deckId: card.setId,
        state: states.get(card.id),
        retired: false,
      })),
    now,
  );
}

function isExamPlan(value: unknown): value is ExamPlan {
  if (typeof value !== 'object' || value === null) return false;
  const plan = value as Partial<ExamPlan>;
  return typeof plan.classId === 'string' && typeof plan.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(plan.date);
}
