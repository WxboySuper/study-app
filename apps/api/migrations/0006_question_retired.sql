-- 0006_question_retired.sql
--
-- Stable questions (docs/API.md "For Muse").
--
-- A question that leaves a deck is no longer deleted: it is *retired*. A
-- retired question is hidden from play and from new quizzes, but its row
-- (and its id) stays, so the review history, the quiz results and the
-- scheduling state that point at it keep making sense, and a question that
-- comes back later finds its progress again.

ALTER TABLE questions ADD COLUMN retired INTEGER NOT NULL DEFAULT 0;

CREATE INDEX questions_deck_active ON questions (deck_id, retired, position);
