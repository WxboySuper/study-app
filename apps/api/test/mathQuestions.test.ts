import { describe, expect, it } from "vitest";

import app from "../src/index";
import type { Bindings } from "../src/types";
import { fakeDatabase } from "./fake-d1";

/** The math questions of the deck API (docs/DECK-FORMAT.md "Math questions"). */

const MUSE = "muse-token-of-the-tests";
const AUTH = {
  authorization: `Bearer ${MUSE}`,
  "content-type": "application/json",
};

function setup(): Bindings {
  const { db } = fakeDatabase();
  return { DB: db, MUSE_TOKEN: MUSE };
}

async function call(
  env: Bindings,
  method: string,
  path: string,
  body?: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON of the API in tests
): Promise<{ status: number; json: any }> {
  const response = await app.fetch(
    new Request(`https://api.test${path}`, {
      method,
      headers: AUTH,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
  return { status: response.status, json: await response.json() };
}

const DERIVATIVE = {
  id: "calc-d1",
  type: "math",
  question: "$\\frac{d}{dx} x^3$",
  answer: "3x^2",
};
const SETUP = {
  id: "calc-s1",
  type: "math",
  question: "Area under $y=x^2$ from 0 to 2 (set it up)",
  setup: true,
  answer: "int(x^2, x, 0, 2)",
};

describe("math questions", () => {
  it("stores and syncs a math question with its spec", async () => {
    const env = setup();
    const created = await call(env, "POST", "/api/decks", {
      name: "Calc",
      questions: [DERIVATIVE, SETUP, { question: "Q?", correct: "a", wrong: ["b"] }],
    });
    expect(created.status).toBe(201);
    const [d, s, mc] = created.json.questions;
    expect(d).toMatchObject({
      id: "calc-d1",
      type: "math",
      correct: "3x^2",
      selfGraded: false,
      math: { kind: "expression", answers: ["3x^2"] },
    });
    expect(s.math).toMatchObject({ kind: "setup", answers: ["int(x^2, x, 0, 2)"] });
    expect(mc.type).toBeUndefined();

    const sync = await call(env, "GET", "/api/sync?since=0");
    const questions = sync.json.decks[0].questions;
    expect(questions[0]).toMatchObject({ type: "math", math: { kind: "expression" } });
    expect(questions[1]).toMatchObject({ type: "math", math: { kind: "setup" } });
  });

  it("keeps the id and the math on a PATCH of the wording", async () => {
    const env = setup();
    const created = await call(env, "POST", "/api/decks", { name: "Calc", questions: [DERIVATIVE] });
    const deckId = created.json.id;
    const patched = await call(env, "PATCH", `/api/decks/${deckId}/questions/calc-d1`, {
      question: "Differentiate $x^3$",
    });
    expect(patched.status).toBe(200);
    const question = patched.json;
    expect(question).toMatchObject({
      id: "calc-d1",
      type: "math",
      question: "Differentiate $x^3$",
      math: { answers: ["3x^2"] },
    });

    const answer = await call(env, "PATCH", `/api/decks/${deckId}/questions/calc-d1`, {
      answer: "3*x^2",
    });
    expect(answer.json.math.answers).toEqual(["3*x^2"]);
  });

  it("rejects a math question without an answer", async () => {
    const env = setup();
    const created = await call(env, "POST", "/api/decks", {
      name: "Calc",
      questions: [{ type: "math", question: "?" }],
    });
    expect(created.status).toBe(400);
  });
});
