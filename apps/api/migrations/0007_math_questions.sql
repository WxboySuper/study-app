-- 0007_math_questions.sql
--
-- Math questions (docs/DECK-FORMAT.md "Math questions").
--
-- A question now has a type: `mc` (the multiple choice and self-graded
-- questions, as before) or `math` (typed on the math keyboard of the game).
-- The math part of a math question (its accepted answers, its kind and its
-- steps) is kept as JSON in `math_json`. The ids do not change, so the
-- progress of every question stays.

ALTER TABLE questions ADD COLUMN type TEXT NOT NULL DEFAULT 'mc';
ALTER TABLE questions ADD COLUMN math_json TEXT;
