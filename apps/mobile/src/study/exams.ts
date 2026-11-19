import { examDeckIds, readiness, type ExamPlan, type Readiness } from '@study-app/core';

import { openLocalStore } from '@/db/local';

const EXAMS_KEY = 'exam-plans';

/** Reads the saved exams. Older saves (one date per class) become exams of that class. */
export async function readExams(): Promise<ExamPlan[]> {
  const store = await openLocalStore();
  const raw = await store.readKv(EXAMS_KEY);
  if (raw === null) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const plans: ExamPlan[] = [];
    for (const entry of parsed) {
      const plan = readPlan(entry);
      if (plan !== null) plans.push(plan);
    }
    return plans;
  } catch {
    return [];
  }
}

async function writeExams(plans: ExamPlan[]): Promise<void> {
  const store = await openLocalStore();
  await store.writeKv(EXAMS_KEY, JSON.stringify(plans));
}

/** A fresh id for a new exam. */
export function newExamId(): string {
  return `exam_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Saves a new exam, or replaces the one with the same id. */
export async function saveExam(plan: ExamPlan): Promise<void> {
  const next = (await readExams()).filter((exam) => exam.id !== plan.id);
  next.push(plan);
  await writeExams(next);
}

/** Removes an exam. */
export async function clearExam(id: string): Promise<void> {
  await writeExams((await readExams()).filter((exam) => exam.id !== id));
}

/** Reads how ready the player is for the decks of one exam. */
export async function readExamReadiness(plan: ExamPlan, now: Date = new Date()): Promise<Readiness> {
  const store = await openLocalStore();
  const [sets, cards, states] = await Promise.all([
    store.listSets(),
    store.listCards(),
    store.listCardStates(),
  ]);
  const deckIds = new Set(examDeckIds(plan, sets.map((set) => set.id)));
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

function readPlan(value: unknown): ExamPlan | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) return null;
  const classId = typeof raw.classId === 'string' ? raw.classId : null;
  const deckIds = Array.isArray(raw.deckIds)
    ? raw.deckIds.filter((id): id is string => typeof id === 'string')
    : [];
  if (typeof raw.id === 'string') {
    return {
      id: raw.id,
      name: typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name : 'Exam',
      classId,
      date: raw.date,
      deckIds,
    };
  }
  // Legacy: one date per class, covering every deck of the class (filled in on load).
  return classId === null
    ? null
    : { id: `exam_${classId}`, name: '', classId, date: raw.date, deckIds: [] };
}
