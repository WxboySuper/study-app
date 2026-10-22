-- 0003_sync.sql
--
-- Phone <-> web progress sync (docs/design/sync.md §2-§4).
--
-- A player is a uuid made on the phone. Every install or browser is a
-- device with its own bearer token (only the SHA-256 is stored). Progress
-- travels as append-only events; the server never folds them, it only
-- relays and backs them up. The phone stays the source of truth.

CREATE TABLE sync_players (
  id         TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE sync_devices (
  id         TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL REFERENCES sync_players(id) ON DELETE CASCADE,
  -- 'phone' | 'web'
  kind       TEXT NOT NULL,
  label      TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen  INTEGER,
  revoked_at INTEGER
);

CREATE INDEX sync_devices_player ON sync_devices(player_id);

CREATE TABLE sync_pair_codes (
  code_hash  TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL REFERENCES sync_players(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  used_at    INTEGER
);

CREATE TABLE sync_events (
  cursor       INTEGER PRIMARY KEY AUTOINCREMENT,
  id           TEXT NOT NULL UNIQUE,
  player_id    TEXT NOT NULL REFERENCES sync_players(id) ON DELETE CASCADE,
  device_id    TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  at           INTEGER NOT NULL,
  type         TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  received_at  INTEGER NOT NULL
);

CREATE INDEX sync_events_player_cursor ON sync_events(player_id, cursor);
