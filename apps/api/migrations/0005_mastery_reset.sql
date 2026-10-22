-- 0005_mastery_reset.sql
--
-- One-time reset of every Mastery/scheduling progress for the reworked
-- Mastery (MASTERY_EPOCH 2, app 0.1.15). D1 applies a migration once, so
-- this runs once. Tokens, tickets, critters (wallet_delta, baseline,
-- spin), decks, questions, quizzes and quiz answers are kept.
--
-- New scheduling events carry `epoch: 2`; the Worker drops older ones on
-- push, so an old app cannot bring the old progress back.

DELETE FROM sync_events
WHERE type IN ('card_state', 'review')
   OR (type = 'kv' AND json_extract(payload_json, '$.key') = 'fishing.masteryCounts.v1');

DELETE FROM review_logs;
DELETE FROM card_state;
