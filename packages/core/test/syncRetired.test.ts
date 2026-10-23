import { describe, expect, it } from "vitest";

import { parseDeck } from "../src/import";
import { parseSyncSnapshot, planDeckSync } from "../src/sync";

describe("retired questions in the deck sync", () => {
  const snapshot = parseSyncSnapshot({
    now: 200,
    decks: [
      {
        id: "d1",
        name: "Bio",
        class: null,
        updatedAt: 150,
        deleted: false,
        questions: [
          { id: "q1", question: "A?", correct: "a", wrong: [], position: 0 },
          {
            id: "q2",
            question: "B?",
            correct: "b",
            wrong: [],
            position: 1,
            retired: true,
          },
        ],
      },
    ],
  });

  it("reads the retired flag (false when missing)", () => {
    expect(snapshot?.decks[0]?.questions.map((q) => q.retired)).toEqual([
      false,
      true,
    ]);
  });

  it("keeps a retired question (and its id) instead of removing it", () => {
    const plan = planDeckSync(
      {
        classes: [],
        decks: [{ id: "set_sync_d1", remoteId: "d1", title: "Bio" }],
        questions: [
          { id: "L1", remoteId: "q1", setId: "set_sync_d1" },
          { id: "L2", remoteId: "q2", setId: "set_sync_d1" },
        ],
      },
      snapshot!,
    );
    const deck = plan.decks[0]!;
    expect(deck.removedQuestionIds).toEqual([]);
    expect(
      deck.questions.map((q) => [q.localId, q.retired, q.created]),
    ).toEqual([
      ["L1", false, false],
      ["L2", true, false],
    ]);
  });
});

describe("question ids in a JSON deck", () => {
  it("reads an optional id per question", () => {
    const deck = parseDeck(
      JSON.stringify({
        name: "Bio",
        questions: [
          { id: " bio-1 ", question: "A?", correct: "a" },
          { question: "B?", correct: "b" },
        ],
      }),
      "x",
    );
    expect(deck.cards.map((card) => card.id)).toEqual(["bio-1", undefined]);
  });
});
