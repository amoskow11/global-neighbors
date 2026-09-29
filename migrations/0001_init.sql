-- Global Neighbors: accounts, sessions, and the Help Board.
-- Timestamps are Unix epoch milliseconds.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,              -- stored lowercase
  password_hash TEXT NOT NULL,                     -- pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>
  account_type  TEXT NOT NULL CHECK (account_type IN ('person','org')),
  display_name  TEXT NOT NULL,
  headline      TEXT NOT NULL DEFAULT '',          -- person: short role; org: tagline
  location      TEXT NOT NULL DEFAULT '',          -- general area only, never a street address
  region        TEXT NOT NULL DEFAULT '',
  bio           TEXT NOT NULL DEFAULT '',          -- person: about me; org: mission
  website       TEXT NOT NULL DEFAULT '',
  causes        TEXT NOT NULL DEFAULT '[]',        -- JSON array of cause names (orgs)
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,                     -- SHA-256 of the session token; the raw token only lives in the cookie
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE login_attempts (
  key        TEXT NOT NULL,                        -- 'email:<addr>' or 'ip:<addr>'
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_login_attempts_key ON login_attempts(key, created_at);

CREATE TABLE help_posts (
  id         TEXT PRIMARY KEY,
  author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('ask','offer')),
  category   TEXT NOT NULL,
  scale      TEXT NOT NULL,
  title      TEXT NOT NULL,
  detail     TEXT NOT NULL,
  location   TEXT NOT NULL,
  region     TEXT NOT NULL,
  pay_kind   TEXT NOT NULL CHECK (pay_kind IN ('volunteer','paid','stipend','funding')),
  pay_label  TEXT NOT NULL DEFAULT '',
  urgency    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in-progress','resolved')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_help_posts_created ON help_posts(created_at DESC);
CREATE INDEX idx_help_posts_author ON help_posts(author_id);

CREATE TABLE help_replies (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES help_posts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at INTEGER NOT NULL,
  UNIQUE (post_id, user_id)
);
CREATE INDEX idx_help_replies_user ON help_replies(user_id);

CREATE TABLE help_messages (
  id         TEXT PRIMARY KEY,
  reply_id   TEXT NOT NULL REFERENCES help_replies(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_help_messages_reply ON help_messages(reply_id, created_at);
