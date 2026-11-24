-- Traction dashboard: sprint goals, marketing campaigns, and suggestions sent to members. Additive only.

-- Members can turn off suggestions ("someone near you could use a hand").
ALTER TABLE users ADD COLUMN no_nudges INTEGER NOT NULL DEFAULT 0;

CREATE TABLE sprints (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  starts_at  INTEGER NOT NULL,
  ends_at    INTEGER NOT NULL,
  goals      TEXT NOT NULL DEFAULT '{}',            -- JSON: metric -> whole number
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- One row per marketing asset or link. Visits arrive as /start?src=<tag> and stay anonymous.
CREATE TABLE campaigns (
  id          TEXT PRIMARY KEY,
  tag         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  audience    TEXT NOT NULL,
  benefit     TEXT NOT NULL,
  channel     TEXT NOT NULL,
  place       TEXT NOT NULL DEFAULT '',
  headline    TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  cta         TEXT NOT NULL DEFAULT '',
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  archived_at INTEGER
);

-- A suggestion or reminder an admin sent. The id matches the notification it created.
CREATE TABLE nudges (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('match','commit','finish')),
  post_id    TEXT NOT NULL REFERENCES help_posts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_by    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (kind, post_id, user_id)
);
CREATE INDEX idx_nudges_user ON nudges(user_id, created_at DESC);
