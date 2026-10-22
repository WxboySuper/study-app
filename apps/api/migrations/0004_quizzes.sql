-- 0004_quizzes.sql
--
-- Quizzes that Muse assigns (docs/API.md §Quizzes). A quiz is a fixed,
-- seeded pick of questions from one deck or one class. The device answers
-- through `quiz_answer` sync events; the push stores them in quiz_answers.

CREATE TABLE quizzes (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  deck_id       TEXT,
  class_id      TEXT,
  -- The picked question ids, JSON encoded (a list of strings), in quiz order.
  card_ids_json TEXT NOT NULL,
  seed          INTEGER NOT NULL,
  due_at        INTEGER,
  created_at    INTEGER NOT NULL,
  -- 'assigned' | 'completed' | 'withdrawn'
  status        TEXT NOT NULL DEFAULT 'assigned',
  started_at    INTEGER,
  completed_at  INTEGER
);

CREATE INDEX quizzes_created_at ON quizzes (created_at);

CREATE TABLE quiz_answers (
  quiz_id     TEXT NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
  card_id     TEXT NOT NULL,
  player_id   TEXT NOT NULL,
  chosen      TEXT NOT NULL,
  correct     INTEGER NOT NULL,
  time_ms     INTEGER NOT NULL,
  answered_at INTEGER NOT NULL,
  PRIMARY KEY (quiz_id, card_id)
);
