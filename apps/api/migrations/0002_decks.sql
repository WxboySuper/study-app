-- 0002_decks.sql
--
-- The decks of the game (Phase 1).
--
-- A deck is a pile of questions that the player shares between their
-- devices: the app imports a deck, pushes it to the Worker and pulls it
-- back on the other devices. The questions of a deck are the ones the
-- author wrote, with their own wrong answers (Blooket style).
--
-- Ids are TEXT (the id of the deck is the one the client knows it by), the
-- timestamps are INTEGER epoch milliseconds and a deck that is deleted is
-- only flagged: the tombstone is what the other devices read to drop it.

CREATE TABLE decks (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  -- The class of the deck (the subject, the exam...); NULL when it has none.
  class_name TEXT,
  updated_at INTEGER NOT NULL,
  -- 0 = the deck is there, 1 = the deck is deleted (a tombstone).
  deleted    INTEGER NOT NULL DEFAULT 0
);

-- The sync reads the decks that changed after a moment in time.
CREATE INDEX decks_updated_at ON decks (updated_at);

CREATE TABLE questions (
  id         TEXT PRIMARY KEY,
  deck_id    TEXT NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
  -- The order of the question inside its deck.
  position   INTEGER NOT NULL,
  question   TEXT NOT NULL,
  correct    TEXT NOT NULL,
  -- The wrong answers of the author, JSON encoded (a list of strings).
  wrong_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX questions_updated_at ON questions (updated_at);
CREATE INDEX questions_deck_id ON questions (deck_id);
