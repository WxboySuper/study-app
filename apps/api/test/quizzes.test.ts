import { describe, expect, it } from "vitest";

import app from "../src/index";
import { parseQuizAnswer, pickQuizCards, seededRandom } from "../src/quizzes";
import type { Bindings } from "../src/types";
import { sqliteDatabase } from "./sqlite-d1";

/** The tests of the quizzes (docs/API.md §Quizzes). */

const MUSE = "muse-token-of-the-quiz-tests";

async function setup(): Promise<Bindings> {
  const { db } = await sqliteDatabase();
  return { DB: db, MUSE_TOKEN: MUSE };
}

async function call(
  env: Bindings,
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return app.fetch(
    new Request(`https://api.cramcritters.test${path}`, { ...init, headers }),
    env,
  );
}

const post = (env: Bindings, path: string, body: unknown, token?: string) =>
  call(env, path, { method: "POST", body: JSON.stringify(body) }, token);

async function json<T = Record<string, unknown>>(
  response: Response,
): Promise<T> {
  return (await response.json()) as T;
}

async function seedDeck(
  env: Bindings,
  id: string,
  klass: string,
  size: number,
): Promise<void> {
  const response = await post(
    env,
    "/api/decks",
    {
      id,
      name: `Deck ${id}`,
      class: klass,
      questions: Array.from({ length: size }, (_, i) => ({
        question: `${id} Q${i}`,
        correct: `A${i}`,
        wrong: [`W${i}`],
      })),
    },
    MUSE,
  );
  expect(response.status).toBeLessThan(300);
}

async function phone(env: Bindings): Promise<string> {
  const response = await post(env, "/api/devices/register", {
    player_id: "player-0001",
    device_id: "phone-0001",
  });
  return (await json<{ device_token: string }>(response)).device_token;
}

interface Quiz {
  id: string;
  cardIds: string[];
  status: string;
  questions?: {
    cardId: string;
    front: string;
    back: string;
    wrong: string[];
  }[];
}

describe("quiz helpers", () => {
  it("picks a seeded subset, the whole pool when it is small", () => {
    const pool = ["a", "b", "c", "d", "e"];
    expect(pickQuizCards(pool, 3, 7)).toEqual(pickQuizCards(pool, 3, 7));
    expect(pickQuizCards(pool, 3, 7)).toHaveLength(3);
    expect(new Set(pickQuizCards(pool, 3, 7)).size).toBe(3);
    expect([...pickQuizCards(pool, 50, 1)].sort()).toEqual(pool);
    const r = seededRandom(1);
    const v = r();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it("reads quiz answers and rejects malformed ones", () => {
    expect(parseQuizAnswer(null)).toBeNull();
    expect(
      parseQuizAnswer({ quizId: "q", cardId: "c", chosen: "x" }),
    ).toBeNull();
    expect(
      parseQuizAnswer({ quizId: "q", cardId: "c", chosen: "x", correct: true }),
    ).toBeNull();
    expect(
      parseQuizAnswer({
        quizId: "q",
        cardId: "c",
        chosen: "x",
        correct: false,
        timeMs: -1,
        answeredAt: 5,
      }),
    ).toEqual({
      quizId: "q",
      cardId: "c",
      chosen: "x",
      correct: false,
      timeMs: 0,
      answeredAt: 5,
    });
  });
});

describe("quiz endpoints", () => {
  it("guards every route", async () => {
    const env = await setup();
    expect(
      (await post(env, "/api/quizzes", { deckId: "d", count: 1 })).status,
    ).toBe(401);
    expect((await call(env, "/api/quizzes")).status).toBe(401);
    expect((await call(env, "/api/quizzes/qz_x")).status).toBe(401);
    expect(
      (await call(env, "/api/quizzes/qz_x/results", {}, await phone(env)))
        .status,
    ).toBe(401);
    expect(
      (await call(env, "/api/quizzes/qz_x", { method: "DELETE" })).status,
    ).toBe(401);
  });

  it("validates the body", async () => {
    const env = await setup();
    await seedDeck(env, "set_a", "Bio", 3);
    const bad = [
      "nope",
      { count: 2 },
      { deckId: "set_a", classId: "Bio", count: 2 },
      { deckId: "set_a", count: 0 },
      { deckId: "set_a", count: 101 },
      { deckId: "set_a", count: 2, dueAt: "not a date" },
    ];
    for (const body of bad) {
      expect((await post(env, "/api/quizzes", body, MUSE)).status).toBe(400);
    }
    expect(
      (await post(env, "/api/quizzes", { deckId: "missing", count: 2 }, MUSE))
        .status,
    ).toBe(404);
    expect(
      (await call(env, "/api/quizzes?status=weird", {}, MUSE)).status,
    ).toBe(400);
  });

  it("assigns, plays through sync, completes and reports results", async () => {
    const env = await setup();
    await seedDeck(env, "set_a", "Bio", 5);
    await seedDeck(env, "set_b", "Bio", 5);

    const created = await post(
      env,
      "/api/quizzes",
      {
        classId: "Bio",
        count: 3,
        dueAt: "2026-10-30T17:00:00-05:00",
        title: "Ch. 4 check",
      },
      MUSE,
    );
    expect(created.status).toBe(201);
    const quiz = await json<Quiz & { classId: string; dueAt: number }>(created);
    expect(quiz.classId).toBe("Bio");
    expect(quiz.cardIds).toHaveLength(3);
    expect(quiz.dueAt).toBe(Date.parse("2026-10-30T22:00:00Z"));

    const token = await phone(env);
    const listed = await json<{ quizzes: Quiz[] }>(
      await call(env, "/api/quizzes?status=assigned", {}, token),
    );
    expect(listed.quizzes.map((q) => q.id)).toEqual([quiz.id]);

    const full = await json<Quiz>(
      await call(env, `/api/quizzes/${quiz.id}`, {}, token),
    );
    expect(full.questions?.map((q) => q.cardId)).toEqual(quiz.cardIds);
    expect(full.questions?.[0]?.wrong.length).toBe(1);

    const answer = (index: number, cardId: string, correct: boolean) => ({
      id: `evt-quiz-${index}-xx`,
      seq: index,
      at: 1_000 + index,
      type: "quiz_answer",
      payload: {
        quizId: quiz.id,
        cardId,
        chosen: correct ? "right" : "wrong",
        correct,
        timeMs: 4000,
        answeredAt: 1_000 + index,
      },
    });
    const [c0, c1, c2] = quiz.cardIds as [string, string, string];
    await post(
      env,
      "/api/sync/push",
      {
        events: [
          answer(1, c0, true),
          answer(2, c1, false),
          answer(3, "not-in-quiz", true),
          { ...answer(4, c0, false), id: "evt-quiz-dup-x" },
          {
            ...answer(5, c0, true),
            payload: {
              quizId: "qz_unknown",
              cardId: c0,
              chosen: "x",
              correct: true,
              answeredAt: 9,
            },
          },
          { ...answer(6, c0, true), payload: "broken" },
        ],
      },
      token,
    );
    let results = await json<{
      status: string;
      score: { correct: number; total: number };
    }>(await call(env, `/api/quizzes/${quiz.id}/results`, {}, MUSE));
    expect(results.status).toBe("assigned");
    expect(results.score).toEqual({ correct: 1, total: 3 });

    await post(env, "/api/sync/push", { events: [answer(7, c2, true)] }, token);
    results = await json(
      await call(env, `/api/quizzes/${quiz.id}/results`, {}, MUSE),
    );
    expect(results).toMatchObject({
      status: "completed",
      startedAt: 1_001,
      completedAt: 1_007,
      score: { correct: 2, total: 3 },
    });
    expect(
      (results as unknown as { answers: { chosenAnswer: string }[] }).answers[0]
        ?.chosenAnswer,
    ).toBe("right");

    const completed = await json<{ quizzes: Quiz[] }>(
      await call(env, "/api/quizzes?status=completed", {}, MUSE),
    );
    expect(completed.quizzes).toHaveLength(1);
    expect(
      (await call(env, `/api/quizzes/${quiz.id}`, { method: "DELETE" }, MUSE))
        .status,
    ).toBe(409);
  });

  it("withdraws an assigned quiz", async () => {
    const env = await setup();
    await seedDeck(env, "set_a", "Bio", 2);
    const quiz = await json<Quiz & { deckId: string }>(
      await post(env, "/api/quizzes", { deckId: "set_a", count: 10 }, MUSE),
    );
    expect(quiz.deckId).toBe("set_a");
    expect(quiz.cardIds).toHaveLength(2);
    expect(
      (await call(env, `/api/quizzes/${quiz.id}`, { method: "DELETE" }, MUSE))
        .status,
    ).toBe(200);
    expect((await call(env, `/api/quizzes/${quiz.id}`, {}, MUSE)).status).toBe(
      404,
    );
    expect(
      (await call(env, "/api/quizzes/qz_nope", { method: "DELETE" }, MUSE))
        .status,
    ).toBe(404);
    expect(
      (await call(env, "/api/quizzes/qz_nope/results", {}, MUSE)).status,
    ).toBe(404);
    const all = await json<{ quizzes: Quiz[] }>(
      await call(env, "/api/quizzes", {}, MUSE),
    );
    expect(all.quizzes).toHaveLength(0);
  });
});

describe("agents add and edit quizzes", () => {
  it("assigns a quiz from several decks and classes", async () => {
    const env = await setup();
    await seedDeck(env, "set_a", "Bio", 3);
    await seedDeck(env, "set_b", "Chem", 3);
    await seedDeck(env, "set_c", "Hist", 3);

    const quiz = await json<Quiz & { deckId?: string; classId?: string }>(
      await post(
        env,
        "/api/quizzes",
        { deckIds: ["set_a", "set_b"], classIds: ["Hist"], count: 100 },
        MUSE,
      ),
    );
    expect(quiz.cardIds).toHaveLength(9);
    expect(quiz.deckId).toBeUndefined();
    expect(quiz.classId).toBeUndefined();

    // A repeated deck does not repeat its questions.
    const repeated = await json<Quiz>(
      await post(env, "/api/quizzes", { deckId: "set_a", deckIds: ["set_a"], count: 100 }, MUSE),
    );
    expect(repeated.cardIds).toHaveLength(3);
  });

  it("hand-picks the questions of a quiz", async () => {
    const env = await setup();
    await seedDeck(env, "set_a", "Bio", 4);
    const all = await json<Quiz>(
      await post(env, "/api/quizzes", { deckId: "set_a", count: 4 }, MUSE),
    );
    const ids = [...all.cardIds].reverse().slice(0, 2);

    const made = await post(env, "/api/quizzes", { cardIds: ids, title: "Two" }, MUSE);
    expect(made.status).toBe(201);
    expect((await json<Quiz>(made)).cardIds).toEqual(ids);

    const bad = [
      { cardIds: [] },
      { cardIds: ["nope"] },
      { cardIds: ids, deckId: "set_a" },
      { cardIds: "x" },
    ];
    expect((await post(env, "/api/quizzes", bad[0], MUSE)).status).toBe(400);
    const unknown = await post(env, "/api/quizzes", bad[1], MUSE);
    expect(unknown.status).toBe(404);
    expect((await json<{ cardIds: string[] }>(unknown)).cardIds).toEqual(["nope"]);
    expect((await post(env, "/api/quizzes", bad[2], MUSE)).status).toBe(400);
    expect((await post(env, "/api/quizzes", bad[3], MUSE)).status).toBe(400);
  });

  it("edits the title, the due date and the questions", async () => {
    const env = await setup();
    await seedDeck(env, "set_a", "Bio", 5);
    const quiz = await json<Quiz & { title: string; dueAt: number | null }>(
      await post(env, "/api/quizzes", { deckId: "set_a", count: 2, title: "Old" }, MUSE),
    );
    const patch = (body: unknown) =>
      call(env, `/api/quizzes/${quiz.id}`, { method: "PATCH", body: JSON.stringify(body) }, MUSE);

    expect((await call(env, `/api/quizzes/${quiz.id}`, { method: "PATCH", body: "{}" })).status).toBe(401);

    const renamed = await json<Quiz & { title: string; dueAt: number | null }>(
      await patch({ title: "New", dueAt: "2026-12-01T12:00:00Z" }),
    );
    expect(renamed.title).toBe("New");
    expect(renamed.dueAt).toBe(Date.parse("2026-12-01T12:00:00Z"));
    expect(renamed.cardIds).toEqual(quiz.cardIds);

    const cleared = await json<{ dueAt: number | null }>(await patch({ dueAt: null }));
    expect(cleared.dueAt).toBeNull();

    // Add every question of the deck, then drop one.
    const everything = await json<Quiz>(
      await post(env, "/api/quizzes", { deckId: "set_a", count: 5 }, MUSE),
    );
    const grown = await json<Quiz>(await patch({ addCardIds: everything.cardIds }));
    expect(grown.cardIds).toHaveLength(5);
    expect(grown.cardIds.slice(0, 2)).toEqual(quiz.cardIds);
    const dropped = grown.cardIds[4] as string;
    const shrunk = await json<Quiz>(await patch({ removeCardIds: [dropped] }));
    expect(shrunk.cardIds).toHaveLength(4);
    expect(shrunk.cardIds).not.toContain(dropped);

    // Replace the whole list.
    const replaced = await json<Quiz>(await patch({ cardIds: [everything.cardIds[0] as string] }));
    expect(replaced.cardIds).toEqual([everything.cardIds[0]]);

    const rejects = [
      { title: "  " },
      { dueAt: "never" },
      { cardIds: [] },
      { cardIds: ["a"], addCardIds: ["b"] },
      { removeCardIds: replaced.cardIds },
      { addCardIds: [7] },
    ];
    for (const body of rejects) {
      expect((await patch(body)).status).toBe(400);
    }
    expect((await patch({ addCardIds: ["ghost"] })).status).toBe(404);
    expect(
      (await call(env, "/api/quizzes/qz_none", { method: "PATCH", body: "{}" }, MUSE)).status,
    ).toBe(404);
    expect(
      (await call(env, `/api/quizzes/${quiz.id}`, { method: "PATCH", body: "nope" }, MUSE)).status,
    ).toBe(400);
  });

  it("finishes a quiz when the last unanswered question is removed, and locks it after", async () => {
    const env = await setup();
    await seedDeck(env, "set_a", "Bio", 3);
    const quiz = await json<Quiz>(
      await post(env, "/api/quizzes", { deckId: "set_a", count: 2 }, MUSE),
    );
    const [first, second] = quiz.cardIds as [string, string];
    const token = await phone(env);
    const push = await post(
      env,
      "/api/sync/push",
      {
        events: [
          {
            id: "evt-edit-quiz-1-xx",
            seq: 1,
            at: 1_000,
            type: "quiz_answer",
            payload: {
              quizId: quiz.id,
              cardId: first,
              chosen: "A",
              correct: true,
              timeMs: 1000,
              answeredAt: 1_000,
            },
          },
        ],
      },
      token,
    );
    expect(push.status).toBeLessThan(300);

    const patch = (body: unknown) =>
      call(env, `/api/quizzes/${quiz.id}`, { method: "PATCH", body: JSON.stringify(body) }, MUSE);
    const done = await json<Quiz>(await patch({ removeCardIds: [second] }));
    expect(done.status).toBe("completed");
    expect((await patch({ title: "Late" })).status).toBe(409);
  });
});
