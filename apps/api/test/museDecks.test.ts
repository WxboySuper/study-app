import { describe, expect, it } from "vitest";

import app from "../src/index";
import type { Bindings } from "../src/types";
import { fakeDatabase, type FakeD1 } from "./fake-d1";

/** The deck API of Muse: stable question ids, retiring, one-question edits. */

const MUSE = "muse-token-of-the-tests";
const AUTH = {
  authorization: `Bearer ${MUSE}`,
  "content-type": "application/json",
};

function setup(): { env: Bindings; fake: FakeD1 } {
  const { db, fake } = fakeDatabase();
  return { env: { DB: db, MUSE_TOKEN: MUSE }, fake };
}

async function call(
  env: Bindings,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = AUTH,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON of the API in tests
): Promise<{ status: number; json: any }> {
  const response = await app.fetch(
    new Request(`https://api.test${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
  return { status: response.status, json: await response.json() };
}

const q = (
  question: string,
  correct: string,
  extra: Record<string, unknown> = {},
) => ({
  question,
  correct,
  wrong: ["x", "y"],
  ...extra,
});

describe("POST /api/decks keeps question ids", () => {
  it("matches by text, not by position, when questions are inserted", async () => {
    const { env } = setup();
    const first = await call(env, "POST", "/api/decks", {
      name: "Bio",
      questions: [q("A?", "a"), q("B?", "b")],
    });
    expect(first.status).toBe(201);
    const [idA, idB] = first.json.questions.map((x: { id: string }) => x.id);

    const second = await call(env, "POST", "/api/decks", {
      name: "Bio",
      questions: [q("New?", "n"), q("  a? ", "a2"), q("B?", "b")],
    });
    expect(second.status).toBe(200);
    const ids = second.json.questions.map((x: { id: string }) => x.id);
    expect(ids[1]).toBe(idA);
    expect(ids[2]).toBe(idB);
    expect(ids[0]).not.toBe(idA);
    expect(second.json.questions[1].correct).toBe("a2");
    expect(second.json.changes).toEqual({
      kept: [idA, idB],
      added: [ids[0]],
      retired: [],
    });
  });

  it("keeps the id when the wording changes and the id is passed", async () => {
    const { env } = setup();
    const first = await call(env, "POST", "/api/decks", {
      name: "Bio",
      questions: [q("Old?", "a")],
    });
    const id = first.json.questions[0].id;
    const second = await call(env, "POST", "/api/decks", {
      id: first.json.id,
      name: "Bio",
      questions: [q("Completely new wording?", "b", { id })],
    });
    expect(second.json.questions[0].id).toBe(id);
    expect(second.json.changes.retired).toEqual([]);
  });

  it("uses the ids Muse gives and refuses duplicates and foreign ids", async () => {
    const { env } = setup();
    const first = await call(env, "POST", "/api/decks", {
      id: "deck_bio",
      name: "Bio",
      questions: [q("A?", "a", { id: "bio-1" }), q("B?", "b", { id: "bio-2" })],
    });
    expect(first.json.questions.map((x: { id: string }) => x.id)).toEqual([
      "bio-1",
      "bio-2",
    ]);

    const dup = await call(env, "POST", "/api/decks", {
      name: "Chem",
      questions: [q("A?", "a", { id: "c1" }), q("B?", "b", { id: "c1" })],
    });
    expect(dup.status).toBe(400);

    const foreign = await call(env, "POST", "/api/decks", {
      name: "Chem",
      questions: [q("A?", "a", { id: "bio-1" })],
    });
    expect(foreign.status).toBe(409);
    expect(foreign.json.error).toBe("question_id_taken");
  });

  it("retires the questions a push leaves out and restores them later", async () => {
    const { env, fake } = setup();
    const first = await call(env, "POST", "/api/decks", {
      name: "Bio",
      questions: [q("A?", "a"), q("B?", "b")],
    });
    const idB = first.json.questions[1].id;

    const second = await call(env, "POST", "/api/decks", {
      name: "Bio",
      questions: [q("A?", "a")],
    });
    expect(second.json.changes.retired).toEqual([idB]);
    expect(fake.questions).toHaveLength(1);
    expect(fake.allQuestions).toHaveLength(2);

    const sync = await call(env, "GET", "/api/sync?since=0", undefined, {});
    expect(sync.json.decks[0].questions).toHaveLength(1);
    const full = await call(
      env,
      "GET",
      "/api/sync?since=0&retired=1",
      undefined,
      {},
    );
    expect(full.json.decks[0].questions[1]).toMatchObject({
      id: idB,
      retired: true,
    });

    const third = await call(env, "POST", "/api/decks", {
      name: "Bio",
      questions: [q("A?", "a"), q("B?", "b")],
    });
    expect(third.json.questions[1].id).toBe(idB);
    expect(fake.questions).toHaveLength(2);
  });

  it("leaves retired questions out of new quizzes", async () => {
    const { env } = setup();
    const first = await call(env, "POST", "/api/decks", {
      id: "deck_bio",
      name: "Bio",
      questions: [q("A?", "a"), q("B?", "b")],
    });
    await call(
      env,
      "DELETE",
      `/api/decks/deck_bio/questions/${first.json.questions[0].id}`,
    );
    const quiz = await call(env, "POST", "/api/quizzes", {
      deckId: "deck_bio",
      count: 10,
      dueAt: "2026-12-01T00:00:00Z",
    });
    expect(quiz.status).toBe(201);
    expect(quiz.json.cardIds).toEqual([first.json.questions[1].id]);
  });
});

describe("Muse deck reads and edits", () => {
  async function seeded() {
    const ctx = setup();
    const first = await call(ctx.env, "POST", "/api/decks", {
      id: "deck_bio",
      name: "Bio",
      class: "Science",
      questions: [q("A?", "a", { id: "a" }), q("B?", "b", { id: "b" })],
    });
    expect(first.status).toBe(201);
    return ctx;
  }

  it("needs the Muse token", async () => {
    const { env } = await seeded();
    expect((await call(env, "GET", "/api/decks", undefined, {})).status).toBe(
      401,
    );
    expect(
      (await call(env, "GET", "/api/decks/deck_bio", undefined, {})).status,
    ).toBe(401);
    expect(
      (await call(env, "PATCH", "/api/decks/deck_bio", { name: "x" }, {}))
        .status,
    ).toBe(401);
    expect(
      (
        await call(
          env,
          "POST",
          "/api/decks/deck_bio/questions",
          q("C?", "c"),
          {},
        )
      ).status,
    ).toBe(401);
    expect(
      (await call(env, "PATCH", "/api/decks/deck_bio/questions/a", {}, {}))
        .status,
    ).toBe(401);
    expect(
      (
        await call(
          env,
          "DELETE",
          "/api/decks/deck_bio/questions/a",
          undefined,
          {},
        )
      ).status,
    ).toBe(401);
  });

  it("lists the decks and reads one with its question ids", async () => {
    const { env } = await seeded();
    const list = await call(env, "GET", "/api/decks");
    expect(list.json.decks).toEqual([
      expect.objectContaining({
        id: "deck_bio",
        name: "Bio",
        class: "Science",
        questionCount: 2,
        retiredCount: 0,
      }),
    ]);
    const one = await call(env, "GET", "/api/decks/deck_bio");
    expect(one.json.questions.map((x: { id: string }) => x.id)).toEqual([
      "a",
      "b",
    ]);
    expect((await call(env, "GET", "/api/decks/nope")).status).toBe(404);
  });

  it("renames a deck and changes its class", async () => {
    const { env, fake } = await seeded();
    const renamed = await call(env, "PATCH", "/api/decks/deck_bio", {
      name: "Biology",
      class: "AP Bio",
    });
    expect(renamed.status).toBe(200);
    expect(fake.decks[0]).toMatchObject({
      name: "Biology",
      class_name: "AP Bio",
    });
    const cleared = await call(env, "PATCH", "/api/decks/deck_bio", {
      class: null,
    });
    expect(cleared.json.class).toBeNull();
    expect(fake.questions.map((x) => x.id)).toEqual(["a", "b"]);

    await call(env, "POST", "/api/decks", {
      name: "Chem",
      questions: [q("C?", "c")],
    });
    const taken = await call(env, "PATCH", "/api/decks/deck_bio", {
      name: "Chem",
    });
    expect(taken.status).toBe(409);
    expect(
      (await call(env, "PATCH", "/api/decks/deck_bio", { name: " " })).status,
    ).toBe(400);
  });

  it("adds one question, refuses a duplicate and restores a retired one", async () => {
    const { env } = await seeded();
    const added = await call(
      env,
      "POST",
      "/api/decks/deck_bio/questions",
      q("C?", "c"),
    );
    expect(added.status).toBe(201);
    expect(added.json.position).toBe(2);

    const dup = await call(
      env,
      "POST",
      "/api/decks/deck_bio/questions",
      q("c?", "other"),
    );
    expect(dup.status).toBe(409);

    await call(env, "DELETE", "/api/decks/deck_bio/questions/b");
    const restored = await call(
      env,
      "POST",
      "/api/decks/deck_bio/questions",
      q("B?", "b"),
    );
    expect(restored.status).toBe(200);
    expect(restored.json).toMatchObject({ id: "b", restored: true });

    const bad = await call(env, "POST", "/api/decks/deck_bio/questions", {
      question: "D?",
    });
    expect(bad.status).toBe(400);
  });

  it("edits one question and keeps its id", async () => {
    const { env, fake } = await seeded();
    const edited = await call(env, "PATCH", "/api/decks/deck_bio/questions/a", {
      question: "A, reworded?",
    });
    expect(edited.status).toBe(200);
    expect(edited.json).toMatchObject({
      id: "a",
      question: "A, reworded?",
      correct: "a",
      wrong: ["x", "y"],
    });

    const answers = await call(
      env,
      "PATCH",
      "/api/decks/deck_bio/questions/a",
      {
        answers: ["p", "q", "r"],
        correct: 1,
      },
    );
    expect(answers.json).toMatchObject({ correct: "q", wrong: ["p", "r"] });

    const tooMany = await call(
      env,
      "PATCH",
      "/api/decks/deck_bio/questions/a",
      {
        wrong: ["1", "2", "3", "4"],
      },
    );
    expect(tooMany.status).toBe(400);
    expect(
      (await call(env, "PATCH", "/api/decks/deck_bio/questions/zzz", {}))
        .status,
    ).toBe(404);
    expect(fake.questions.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("retires one question and deletes a deck", async () => {
    const { env, fake } = await seeded();
    const retired = await call(
      env,
      "DELETE",
      "/api/decks/deck_bio/questions/a",
    );
    expect(retired.json).toEqual({ ok: true, id: "a", retired: true });
    expect(fake.questions.map((x) => x.id)).toEqual(["b"]);
    expect(
      (await call(env, "DELETE", "/api/decks/deck_bio/questions/a")).status,
    ).toBe(200);
    expect(
      (await call(env, "DELETE", "/api/decks/deck_bio/questions/nope")).status,
    ).toBe(404);

    const deleted = await call(env, "DELETE", "/api/decks/deck_bio");
    expect(deleted.status).toBe(200);
    expect((await call(env, "GET", "/api/decks")).json.decks).toEqual([]);
  });
});
